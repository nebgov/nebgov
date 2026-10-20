//! Fuzz treasury stream validation and pagination boundaries.

#![no_main]

use arbitrary::Arbitrary;
use libfuzzer_sys::fuzz_target;
use soroban_sdk::{testutils::Address as _, Address, Env, String, Symbol, Vec};
use sorogov_treasury::{TreasuryContract, TreasuryContractClient};

#[derive(Arbitrary, Debug)]
struct Input {
    total_allocated: i128,
    start_ledger: u32,
    end_ledger: u32,
    max_single_spend: i128,
    cooldown_ledgers: u32,
    offset: u64,
    limit: u64,
}

fuzz_target!(|input: Input| {
    let env = Env::default();
    env.mock_all_auths();
    let governor = Address::generate(&env);
    let owner = Address::generate(&env);
    let token = Address::generate(&env);
    let treasury_id = env.register(TreasuryContract, ());
    let client = TreasuryContractClient::new(&env, &treasury_id);

    let owners = Vec::from_array(&env, [governor.clone()]);
    client.initialize(&owners, &1, &governor);

    // Invalid values must be rejected, while valid values must round-trip.
    let result = client.try_create_stream(
        &governor,
        &Symbol::new(&env, "fuzz"),
        &owner,
        &token,
        &input.total_allocated,
        &input.start_ledger,
        &input.end_ledger,
        &input.max_single_spend,
        &input.cooldown_ledgers,
        &0,
    );
    if let Ok(Ok(stream_id)) = result {
        let stream = client.get_stream(&stream_id);
        assert_eq!(stream.owner, owner);
        assert_eq!(stream.total_allocated, input.total_allocated);
        assert!(stream.end_ledger >= stream.start_ledger);
        assert!(stream.max_single_spend > 0);
    }

    let page = client.get_streams(&input.offset, &input.limit);
    assert!(page.len() <= input.limit.min(u64::from(u32::MAX)) as u32);
    let _ = String::from_str(&env, "fuzz");
});
