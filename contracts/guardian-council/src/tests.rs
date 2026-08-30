#![cfg(test)]

use crate::error::GuardianCouncilError;
use crate::{GuardianAction, GuardianCouncilContract, GuardianCouncilContractClient, MemberRotation};
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::{contract, contractimpl, symbol_short, Address, Env, Symbol, Vec};

// ── Minimal mock governor: just enough of the guardian surface to prove the
//    cross-contract call lands. `pause`/`unpause` require auth from `caller`
//    exactly like the real governor's contract-self-auth path. ─────────────
#[contract]
pub struct MockGovernor;

#[contractimpl]
impl MockGovernor {
    pub fn pause(env: Env, caller: Address) {
        caller.require_auth();
        env.storage().instance().set(&PAUSED, &true);
    }
    pub fn unpause(env: Env, caller: Address) {
        caller.require_auth();
        env.storage().instance().set(&PAUSED, &false);
    }
    pub fn cancel(env: Env, caller: Address, proposal_id: u64) {
        caller.require_auth();
        env.storage().instance().set(&LAST_CANCELLED, &proposal_id);
    }
    pub fn cancel_queued(env: Env, caller: Address, proposal_id: u64) {
        caller.require_auth();
        env.storage().instance().set(&LAST_CANCELLED_QUEUED, &proposal_id);
    }
    pub fn is_paused(env: Env) -> bool {
        env.storage().instance().get(&PAUSED).unwrap_or(false)
    }
    pub fn last_cancelled(env: Env) -> u64 {
        env.storage().instance().get(&LAST_CANCELLED).unwrap_or(0)
    }
}

const PAUSED: Symbol = symbol_short!("paused");
const LAST_CANCELLED: Symbol = symbol_short!("lc");
const LAST_CANCELLED_QUEUED: Symbol = symbol_short!("lcq");

struct Setup {
    env: Env,
    council: GuardianCouncilContractClient<'static>,
    governor_id: Address,
    m: [Address; 3],
}

fn setup(threshold: u32, ttl: u32) -> Setup {
    let env = Env::default();
    env.mock_all_auths();

    let governor_id = env.register(MockGovernor, ());
    let council_id = env.register(GuardianCouncilContract, ());
    let council = GuardianCouncilContractClient::new(&env, &council_id);

    let m = [
        Address::generate(&env),
        Address::generate(&env),
        Address::generate(&env),
    ];
    let mut members = Vec::new(&env);
    for a in &m {
        members.push_back(a.clone());
    }
    council.initialize(&members, &threshold, &governor_id, &ttl);

    Setup { env, council, governor_id, m }
}

fn mock_governor(env: &Env, id: &Address) -> MockGovernorClient<'static> {
    MockGovernorClient::new(env, id)
}

#[test]
fn pause_executes_only_after_threshold_and_lands_on_governor() {
    let s = setup(2, 0);
    let id = s.council.propose_action(&s.m[0], &GuardianAction::Pause); // auto-approves m0

    // 1 of 2 — not executable yet.
    let err = s.council.try_execute_action(&id).unwrap_err().unwrap();
    assert_eq!(err, GuardianCouncilError::ThresholdNotMet);

    s.council.approve_action(&s.m[1], &id);
    s.council.execute_action(&id);

    assert!(mock_governor(&s.env, &s.governor_id).is_paused());
    assert!(s.council.get_action(&id).executed);
}

#[test]
fn non_member_cannot_propose_or_approve() {
    let s = setup(2, 0);
    let stranger = Address::generate(&s.env);

    let e1 = s
        .council
        .try_propose_action(&stranger, &GuardianAction::Pause)
        .unwrap_err()
        .unwrap();
    assert_eq!(e1, GuardianCouncilError::NotAMember);

    let id = s.council.propose_action(&s.m[0], &GuardianAction::Pause);
    let e2 = s
        .council
        .try_approve_action(&stranger, &id)
        .unwrap_err()
        .unwrap();
    assert_eq!(e2, GuardianCouncilError::NotAMember);
}

#[test]
fn double_approval_does_not_double_count() {
    let s = setup(3, 0);
    let id = s.council.propose_action(&s.m[0], &GuardianAction::Pause); // m0 approved

    s.council.approve_action(&s.m[0], &id); // same member again
    assert_eq!(s.council.get_action(&id).approvals.len(), 1);

    let err = s.council.try_execute_action(&id).unwrap_err().unwrap();
    assert_eq!(err, GuardianCouncilError::ThresholdNotMet);
}

#[test]
fn revoke_drops_below_threshold_and_blocks_until_reapproved() {
    let s = setup(2, 0);
    let id = s.council.propose_action(&s.m[0], &GuardianAction::Pause);
    s.council.approve_action(&s.m[1], &id); // now 2/2

    s.council.revoke_approval(&s.m[1], &id); // back to 1/2
    let err = s.council.try_execute_action(&id).unwrap_err().unwrap();
    assert_eq!(err, GuardianCouncilError::ThresholdNotMet);

    s.council.approve_action(&s.m[2], &id); // 2/2 again
    s.council.execute_action(&id);
    assert!(mock_governor(&s.env, &s.governor_id).is_paused());
}

#[test]
fn execution_after_ttl_elapsed_panics() {
    let s = setup(2, 100);
    let id = s.council.propose_action(&s.m[0], &GuardianAction::CancelActive(7));
    s.council.approve_action(&s.m[1], &id);

    s.env.ledger().with_mut(|l| l.sequence_number += 101);

    let err = s.council.try_execute_action(&id).unwrap_err().unwrap();
    assert_eq!(err, GuardianCouncilError::ActionExpired);
}

#[test]
fn rotate_member_updates_membership_after_execution() {
    let s = setup(2, 0);
    let newcomer = Address::generate(&s.env);

    let id = s.council.propose_action(
        &s.m[0],
        &GuardianAction::RotateMember(MemberRotation {
            old: s.m[2].clone(),
            new: newcomer.clone(),
        }),
    );
    s.council.approve_action(&s.m[1], &id);
    s.council.execute_action(&id);

    let members = s.council.get_members();
    assert!(!members.contains(&s.m[2]));
    assert!(members.contains(&newcomer));

    // The rotated-in member can now act.
    let id2 = s.council.propose_action(&newcomer, &GuardianAction::Pause);
    s.council.approve_action(&s.m[0], &id2);
    s.council.execute_action(&id2);
    assert!(mock_governor(&s.env, &s.governor_id).is_paused());
}

#[test]
fn cancel_active_forwards_proposal_id_to_governor() {
    let s = setup(1, 0);
    let id = s.council.propose_action(&s.m[0], &GuardianAction::CancelActive(42));
    s.council.execute_action(&id);
    assert_eq!(mock_governor(&s.env, &s.governor_id).last_cancelled(), 42);
}

#[test]
fn set_threshold_goes_through_a_council_action() {
    let s = setup(2, 0);
    let id = s.council.propose_action(&s.m[0], &GuardianAction::SetThreshold(3));
    s.council.approve_action(&s.m[1], &id);
    s.council.execute_action(&id);
    assert_eq!(s.council.get_threshold(), 3);
}

#[test]
fn cannot_execute_twice() {
    let s = setup(1, 0);
    let id = s.council.propose_action(&s.m[0], &GuardianAction::Pause);
    s.council.execute_action(&id);
    let err = s.council.try_execute_action(&id).unwrap_err().unwrap();
    assert_eq!(err, GuardianCouncilError::AlreadyExecuted);
}

#[test]
fn initialize_rejects_bad_threshold_and_duplicate_members() {
    let env = Env::default();
    env.mock_all_auths();
    let governor_id = env.register(MockGovernor, ());
    let council_id = env.register(GuardianCouncilContract, ());
    let council = GuardianCouncilContractClient::new(&env, &council_id);

    let a = Address::generate(&env);
    let mut dupes = Vec::new(&env);
    dupes.push_back(a.clone());
    dupes.push_back(a.clone());
    let e = council
        .try_initialize(&dupes, &1u32, &governor_id, &0u32)
        .unwrap_err()
        .unwrap();
    assert_eq!(e, GuardianCouncilError::DuplicateMember);

    let mut one = Vec::new(&env);
    one.push_back(a.clone());
    let e2 = council
        .try_initialize(&one, &5u32, &governor_id, &0u32)
        .unwrap_err()
        .unwrap();
    assert_eq!(e2, GuardianCouncilError::InvalidThreshold);
}
