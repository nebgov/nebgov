use soroban_sdk::{Address, Env, Symbol};

pub const ACTION_PROPOSED_TOPIC: &str = "ActionProposed";
pub const ACTION_APPROVED_TOPIC: &str = "ActionApproved";
pub const APPROVAL_REVOKED_TOPIC: &str = "ApprovalRevoked";
pub const ACTION_EXECUTED_TOPIC: &str = "ActionExecuted";
pub const MEMBERSHIP_ROTATED_TOPIC: &str = "MembershipRotated";
pub const THRESHOLD_UPDATED_TOPIC: &str = "ThresholdUpdated";

/// `action` is emitted as its debug-ish discriminant symbol so the indexer can
/// group without decoding the whole `GuardianAction` from XDR.
pub fn emit_action_proposed(env: &Env, action_id: u64, proposer: &Address, action_kind: Symbol) {
    env.events().publish(
        (Symbol::new(env, ACTION_PROPOSED_TOPIC), proposer.clone()),
        (action_id, action_kind),
    );
}

pub fn emit_action_approved(env: &Env, action_id: u64, member: &Address, approvals_count: u32) {
    env.events().publish(
        (Symbol::new(env, ACTION_APPROVED_TOPIC), member.clone()),
        (action_id, approvals_count),
    );
}

pub fn emit_approval_revoked(env: &Env, action_id: u64, member: &Address) {
    env.events().publish(
        (Symbol::new(env, APPROVAL_REVOKED_TOPIC), member.clone()),
        action_id,
    );
}

pub fn emit_action_executed(env: &Env, action_id: u64) {
    env.events().publish(
        (Symbol::new(env, ACTION_EXECUTED_TOPIC),),
        action_id,
    );
}

pub fn emit_membership_rotated(env: &Env, old: &Address, new: &Address) {
    env.events().publish(
        (Symbol::new(env, MEMBERSHIP_ROTATED_TOPIC),),
        (old.clone(), new.clone()),
    );
}

pub fn emit_threshold_updated(env: &Env, old_threshold: u32, new_threshold: u32) {
    env.events().publish(
        (Symbol::new(env, THRESHOLD_UPDATED_TOPIC),),
        (old_threshold, new_threshold),
    );
}
