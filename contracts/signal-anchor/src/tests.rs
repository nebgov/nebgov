use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::Env;

fn setup() -> (Env, SignalAnchorContractClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(SignalAnchorContract, ());
    let client = SignalAnchorContractClient::new(&env, &contract_id);
    client.initialize(&admin);
    (env, client, admin)
}

#[test]
fn anchor_result_succeeds_once() {
    let (env, client, admin) = setup();
    let hash = BytesN::from_array(&env, &[7u8; 32]);

    client.anchor_result(&admin, &1, &hash);

    let record = client.get_anchor(&1).unwrap();
    assert_eq!(record.poll_id, 1);
    assert_eq!(record.result_hash, hash);
    assert_eq!(record.anchorer, admin);
    assert_eq!(record.anchored_ledger, env.ledger().sequence());
}

#[test]
#[should_panic]
fn anchor_result_panics_on_second_call_for_same_poll_id() {
    let (env, client, admin) = setup();
    let hash_a = BytesN::from_array(&env, &[1u8; 32]);
    let hash_b = BytesN::from_array(&env, &[2u8; 32]);

    client.anchor_result(&admin, &1, &hash_a);
    client.anchor_result(&admin, &1, &hash_b);
}

#[test]
fn get_anchor_returns_none_for_unanchored_poll() {
    let (_env, client, _admin) = setup();
    assert_eq!(client.get_anchor(&42), None);
}

#[test]
#[should_panic]
fn anchor_result_panics_for_non_admin_anchorer() {
    let (env, client, _admin) = setup();
    let stranger = Address::generate(&env);
    let hash = BytesN::from_array(&env, &[3u8; 32]);

    client.anchor_result(&stranger, &1, &hash);
}

#[test]
#[should_panic]
fn initialize_panics_on_second_call() {
    let (_env, client, admin) = setup();
    client.initialize(&admin);
}
