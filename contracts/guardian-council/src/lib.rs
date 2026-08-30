#![no_std]

//! Guardian Council (Issue #995).
//!
//! An M-of-N multisig that can stand in as `contracts/governor`'s emergency
//! `guardian` instead of a single key. Governor is **not** modified: its
//! `guardian` is already a plain `Address`, and a contract-initiated call is
//! authorized by Soroban as coming from the calling contract's own address
//! with no signature. So governance sets this contract as its guardian via
//! governor's existing `set_guardian()`, and thereafter this contract calls
//! `governor.pause(&self_address)` / `cancel(&self_address, id)` / etc. from
//! inside `execute_action` once `threshold` members have approved.
//!
//! Membership rotation and threshold changes are themselves council actions —
//! there is no bare setter.

pub mod error;
mod events;

use crate::error::GuardianCouncilError;
use soroban_sdk::{
    contract, contractclient, contractimpl, contracttype, Address, Env, Symbol, Vec,
};

// ── Governor interface (mirrored, no crate dependency — governor is near the
//    CI WASM size cap and must not be touched) ──────────────────────────────
#[contractclient(name = "GovernorClient")]
pub trait GovernorTrait {
    fn pause(env: Env, caller: Address);
    fn unpause(env: Env, caller: Address);
    fn cancel(env: Env, caller: Address, proposal_id: u64);
    fn cancel_queued(env: Env, caller: Address, proposal_id: u64);
    fn is_paused(env: Env) -> bool;
}

/// Swap one sitting member (`old`) for a newcomer (`new`) in a single action.
/// A dedicated struct because `#[contracttype]` enum variants cannot carry
/// named fields.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct MemberRotation {
    pub old: Address,
    pub new: Address,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum GuardianAction {
    Pause,
    Unpause,
    CancelActive(u64),
    CancelQueued(u64),
    RotateMember(MemberRotation),
    SetThreshold(u32),
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct PendingAction {
    pub id: u64,
    pub action: GuardianAction,
    pub proposer: Address,
    pub created_ledger: u32,
    pub approvals: Vec<Address>,
    pub executed: bool,
}

#[contracttype]
pub enum DataKey {
    Members,
    Threshold,
    Governor,
    NextActionId,
    Action(u64),
    ActionTtlLedgers,
}

/// Pending actions and the members list are long-lived; bump their TTL by this
/// on every write. ~1.2M ledgers ≈ 70 days at ~5s close time.
const COUNCIL_TTL_LEDGERS: u32 = 1_200_000;

#[contract]
pub struct GuardianCouncilContract;

#[contractimpl]
impl GuardianCouncilContract {
    pub fn initialize(
        env: Env,
        members: Vec<Address>,
        threshold: u32,
        governor: Address,
        action_ttl_ledgers: u32,
    ) {
        if env.storage().instance().has(&DataKey::Governor) {
            env.panic_with_error(GuardianCouncilError::AlreadyInitialized);
        }
        if members.is_empty() {
            env.panic_with_error(GuardianCouncilError::InvalidMembers);
        }
        if threshold == 0 || threshold > members.len() {
            env.panic_with_error(GuardianCouncilError::InvalidThreshold);
        }
        // Reject duplicate members so approval counting stays sound.
        for i in 0..members.len() {
            for j in (i + 1)..members.len() {
                if members.get_unchecked(i) == members.get_unchecked(j) {
                    env.panic_with_error(GuardianCouncilError::DuplicateMember);
                }
            }
        }

        env.storage().instance().set(&DataKey::Members, &members);
        env.storage().instance().set(&DataKey::Threshold, &threshold);
        env.storage().instance().set(&DataKey::Governor, &governor);
        env.storage().instance().set(&DataKey::NextActionId, &0u64);
        env.storage()
            .instance()
            .set(&DataKey::ActionTtlLedgers, &action_ttl_ledgers);
    }

    /// A member proposes an action and auto-approves it as the first signer.
    pub fn propose_action(env: Env, proposer: Address, action: GuardianAction) -> u64 {
        proposer.require_auth();
        Self::require_member(&env, &proposer);

        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextActionId)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::NextActionId, &(id + 1));

        let mut approvals = Vec::new(&env);
        approvals.push_back(proposer.clone());

        let pending = PendingAction {
            id,
            action: action.clone(),
            proposer: proposer.clone(),
            created_ledger: env.ledger().sequence(),
            approvals,
            executed: false,
        };
        Self::put_action(&env, &pending);

        events::emit_action_proposed(&env, id, &proposer, Self::action_kind(&env, &action));
        events::emit_action_approved(&env, id, &proposer, 1);
        id
    }

    pub fn approve_action(env: Env, member: Address, action_id: u64) {
        member.require_auth();
        Self::require_member(&env, &member);

        let mut pending = Self::must_get_action(&env, action_id);
        if pending.executed {
            env.panic_with_error(GuardianCouncilError::AlreadyExecuted);
        }
        // Double-approval from the same member does not double-count.
        if !pending.approvals.contains(&member) {
            pending.approvals.push_back(member.clone());
            Self::put_action(&env, &pending);
        }
        events::emit_action_approved(&env, action_id, &member, pending.approvals.len());
    }

    pub fn revoke_approval(env: Env, member: Address, action_id: u64) {
        member.require_auth();

        let mut pending = Self::must_get_action(&env, action_id);
        if pending.executed {
            env.panic_with_error(GuardianCouncilError::AlreadyExecuted);
        }
        match pending.approvals.first_index_of(&member) {
            Some(idx) => {
                pending.approvals.remove(idx);
                Self::put_action(&env, &pending);
                events::emit_approval_revoked(&env, action_id, &member);
            }
            None => env.panic_with_error(GuardianCouncilError::NotApproved),
        }
    }

    /// Permissionless once approvals ≥ threshold and the action is still
    /// within its TTL window. Dispatches on the action variant.
    pub fn execute_action(env: Env, action_id: u64) {
        let mut pending = Self::must_get_action(&env, action_id);
        if pending.executed {
            env.panic_with_error(GuardianCouncilError::AlreadyExecuted);
        }

        // Only members who are *still* members at execution time count — a
        // rotation could have removed an earlier approver.
        let members = Self::members(&env);
        let live_approvals: u32 = pending
            .approvals
            .iter()
            .filter(|a| members.contains(a))
            .count() as u32;
        if live_approvals < Self::threshold(&env) {
            env.panic_with_error(GuardianCouncilError::ThresholdNotMet);
        }

        let ttl: u32 = env
            .storage()
            .instance()
            .get(&DataKey::ActionTtlLedgers)
            .unwrap_or(0);
        if ttl > 0 && env.ledger().sequence() > pending.created_ledger.saturating_add(ttl) {
            env.panic_with_error(GuardianCouncilError::ActionExpired);
        }

        match pending.action.clone() {
            GuardianAction::Pause => Self::governor_client(&env).pause(&env.current_contract_address()),
            GuardianAction::Unpause => {
                Self::governor_client(&env).unpause(&env.current_contract_address())
            }
            GuardianAction::CancelActive(pid) => {
                Self::governor_client(&env).cancel(&env.current_contract_address(), &pid)
            }
            GuardianAction::CancelQueued(pid) => {
                Self::governor_client(&env).cancel_queued(&env.current_contract_address(), &pid)
            }
            GuardianAction::RotateMember(r) => Self::do_rotate(&env, &r.old, &r.new),
            GuardianAction::SetThreshold(new_threshold) => Self::do_set_threshold(&env, new_threshold),
        }

        pending.executed = true;
        Self::put_action(&env, &pending);
        events::emit_action_executed(&env, action_id);
    }

    // ── Views ────────────────────────────────────────────────────────────
    pub fn get_action(env: Env, action_id: u64) -> PendingAction {
        Self::must_get_action(&env, action_id)
    }

    pub fn get_members(env: Env) -> Vec<Address> {
        Self::members(&env)
    }

    pub fn get_threshold(env: Env) -> u32 {
        Self::threshold(&env)
    }

    pub fn get_governor(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Governor)
            .unwrap_or_else(|| env.panic_with_error(GuardianCouncilError::NotInitialized))
    }

    // ── Internals ────────────────────────────────────────────────────────
    fn members(env: &Env) -> Vec<Address> {
        env.storage()
            .instance()
            .get(&DataKey::Members)
            .unwrap_or_else(|| env.panic_with_error(GuardianCouncilError::NotInitialized))
    }

    fn threshold(env: &Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::Threshold)
            .unwrap_or_else(|| env.panic_with_error(GuardianCouncilError::NotInitialized))
    }

    fn require_member(env: &Env, who: &Address) {
        if !Self::members(env).contains(who) {
            env.panic_with_error(GuardianCouncilError::NotAMember);
        }
    }

    fn governor_client(env: &Env) -> GovernorClient {
        GovernorClient::new(env, &Self::get_governor(env.clone()))
    }

    fn must_get_action(env: &Env, action_id: u64) -> PendingAction {
        env.storage()
            .persistent()
            .get(&DataKey::Action(action_id))
            .unwrap_or_else(|| env.panic_with_error(GuardianCouncilError::ActionNotFound))
    }

    fn put_action(env: &Env, pending: &PendingAction) {
        let key = DataKey::Action(pending.id);
        env.storage().persistent().set(&key, pending);
        env.storage()
            .persistent()
            .extend_ttl(&key, COUNCIL_TTL_LEDGERS, COUNCIL_TTL_LEDGERS);
    }

    fn do_rotate(env: &Env, old: &Address, new: &Address) {
        let mut members = Self::members(env);
        match members.first_index_of(old) {
            Some(idx) => {
                members.remove(idx);
            }
            None => env.panic_with_error(GuardianCouncilError::MemberNotFound),
        }
        if members.contains(new) {
            env.panic_with_error(GuardianCouncilError::DuplicateMember);
        }
        members.push_back(new.clone());
        // Rotating out a member can leave threshold > N; clamp it.
        let threshold = Self::threshold(env);
        if threshold > members.len() {
            env.storage()
                .instance()
                .set(&DataKey::Threshold, &members.len());
        }
        env.storage().instance().set(&DataKey::Members, &members);
        events::emit_membership_rotated(env, old, new);
    }

    fn do_set_threshold(env: &Env, new_threshold: u32) {
        let members_len = Self::members(env).len();
        if new_threshold == 0 || new_threshold > members_len {
            env.panic_with_error(GuardianCouncilError::InvalidThreshold);
        }
        let old = Self::threshold(env);
        env.storage()
            .instance()
            .set(&DataKey::Threshold, &new_threshold);
        events::emit_threshold_updated(env, old, new_threshold);
    }

    fn action_kind(env: &Env, action: &GuardianAction) -> Symbol {
        match action {
            GuardianAction::Pause => Symbol::new(env, "Pause"),
            GuardianAction::Unpause => Symbol::new(env, "Unpause"),
            GuardianAction::CancelActive(_) => Symbol::new(env, "CancelActive"),
            GuardianAction::CancelQueued(_) => Symbol::new(env, "CancelQueued"),
            GuardianAction::RotateMember(_) => Symbol::new(env, "RotateMember"),
            GuardianAction::SetThreshold(_) => Symbol::new(env, "SetThreshold"),
        }
    }
}

#[cfg(test)]
mod tests;
