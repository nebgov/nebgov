//! Fuzz proposal-bond configuration and authorization boundaries.

#![no_main]

use arbitrary::Arbitrary;
use libfuzzer_sys::fuzz_target;
use soroban_sdk::{testutils::Address as _, Address, BytesN, Env};
use sorogov_proposal_bonds::{ProposalBondsContract, ProposalBondsContractClient};

#[derive(Arbitrary, Debug)]
struct Input {
    bond_amount: i128,
    refund_grace_ledgers: u32,
    max_lock_ledgers: u32,
    replacement_amount: i128,
}

fuzz_target!(|input: Input| {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let governor = Address::generate(&env);
    let token = Address::generate(&env);
    let id = env.register(ProposalBondsContract, ());
    let client = ProposalBondsContractClient::new(&env, &id);

    let initialize = client.try_initialize(
        &admin,
        &token,
        &input.bond_amount,
        &governor,
        &input.refund_grace_ledgers,
        &input.max_lock_ledgers,
    );
    if initialize.is_err() {
        return;
    }

    let settings = client.get_settings();
    assert_eq!(settings.bond_token, token);
    assert_eq!(settings.bond_amount, input.bond_amount);

    let update = client.try_update_bond_amount(&admin, &input.replacement_amount);
    if let Ok(Ok(())) = update {
        assert_eq!(client.get_settings().bond_amount, input.replacement_amount);
        assert!(input.replacement_amount > 0);
    }

    let hash = BytesN::from_array(&env, &[0u8; 32]);
    let _ = client.get_bond(&hash);
});
