#![cfg(test)]

use super::*;
use soroban_sdk::testutils::Address as _;

fn create_token_contract<'a>(
    env: &Env,
    admin: &Address,
) -> (Address, token::StellarAssetClient<'a>, token::Client<'a>) {
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let address = sac.address();
    let asset_client = token::StellarAssetClient::new(env, &address);
    let token_client = token::Client::new(env, &address);
    (address, asset_client, token_client)
}

fn setup<'a>(
    env: &Env,
    milestone_amounts: Vec<i128>,
) -> (
    Address,
    EscrowContractClient<'a>,
    Address,      // token address
    token::StellarAssetClient<'a>,
    token::Client<'a>,
    Address,      // recipient
    Vec<Address>, // verifiers
) {
    let token_admin = Address::generate(env);
    let (token_address, asset_client, token_client) = create_token_contract(env, &token_admin);

    let recipient = Address::generate(env);
    let verifier1 = Address::generate(env);
    let verifier2 = Address::generate(env);
    let verifiers = Vec::from_array(env, [verifier1.clone(), verifier2.clone()]);

    let contract_id = env.register(
        EscrowContract,
        (token_address.clone(), recipient.clone(), verifiers.clone(), milestone_amounts),
    );
    let client = EscrowContractClient::new(env, &contract_id);

    (
        contract_id,
        client,
        token_address,
        asset_client,
        token_client,
        recipient,
        verifiers,
    )
}

#[test]
fn test_full_flow_deposit_verify_release() {
    let env = Env::default();
    env.mock_all_auths();

    let milestone_amounts = Vec::from_array(&env, [100i128, 200i128]);
    let (contract_id, client, _token_address, asset_client, token_client, recipient, verifiers) =
        setup(&env, milestone_amounts);
    let _ = contract_id;

    let donor = Address::generate(&env);
    asset_client.mint(&donor, &1000);

    client.deposit(&donor, &300);

    assert_eq!(token_client.balance(&donor), 700);
    assert_eq!(client.balance(), 300);

    let verifier = verifiers.get(0).unwrap();
    client.verify_milestone(&verifier, &0);
    client.release(&0);

    assert_eq!(token_client.balance(&recipient), 100);
    assert_eq!(client.balance(), 200);

    let verifier2 = verifiers.get(1).unwrap();
    client.verify_milestone(&verifier2, &1);
    client.release(&1);

    assert_eq!(token_client.balance(&recipient), 300);
    assert_eq!(client.balance(), 0);
}

#[test]
fn test_unauthorized_verifier_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let milestone_amounts = Vec::from_array(&env, [100i128]);
    let (_contract_id, client, _token_address, asset_client, _token_client, _recipient, _verifiers) =
        setup(&env, milestone_amounts);

    let donor = Address::generate(&env);
    asset_client.mint(&donor, &1000);
    client.deposit(&donor, &100);

    let intruder = Address::generate(&env);
    let result = client.try_verify_milestone(&intruder, &0);
    assert_eq!(result, Err(Ok(EscrowError::Unauthorized)));
}

#[test]
fn test_double_verify_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let milestone_amounts = Vec::from_array(&env, [100i128]);
    let (_contract_id, client, _token_address, asset_client, _token_client, _recipient, verifiers) =
        setup(&env, milestone_amounts);

    let donor = Address::generate(&env);
    asset_client.mint(&donor, &1000);
    client.deposit(&donor, &100);

    let verifier = verifiers.get(0).unwrap();
    client.verify_milestone(&verifier, &0);

    let result = client.try_verify_milestone(&verifier, &0);
    assert_eq!(result, Err(Ok(EscrowError::MilestoneAlreadyVerified)));
}

#[test]
fn test_release_before_verify_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let milestone_amounts = Vec::from_array(&env, [100i128]);
    let (_contract_id, client, _token_address, asset_client, _token_client, _recipient, _verifiers) =
        setup(&env, milestone_amounts);

    let donor = Address::generate(&env);
    asset_client.mint(&donor, &1000);
    client.deposit(&donor, &100);

    let result = client.try_release(&0);
    assert_eq!(result, Err(Ok(EscrowError::MilestoneNotVerified)));
}

#[test]
fn test_double_release_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let milestone_amounts = Vec::from_array(&env, [100i128]);
    let (_contract_id, client, _token_address, asset_client, _token_client, _recipient, verifiers) =
        setup(&env, milestone_amounts);

    let donor = Address::generate(&env);
    asset_client.mint(&donor, &1000);
    client.deposit(&donor, &100);

    let verifier = verifiers.get(0).unwrap();
    client.verify_milestone(&verifier, &0);
    client.release(&0);

    let result = client.try_release(&0);
    assert_eq!(result, Err(Ok(EscrowError::MilestoneAlreadyReleased)));
}

#[test]
fn test_non_positive_deposit_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let milestone_amounts = Vec::from_array(&env, [100i128]);
    let (_contract_id, client, _token_address, asset_client, _token_client, _recipient, _verifiers) =
        setup(&env, milestone_amounts);

    let donor = Address::generate(&env);
    asset_client.mint(&donor, &1000);

    let result = client.try_deposit(&donor, &0);
    assert_eq!(result, Err(Ok(EscrowError::InvalidAmount)));

    let result_negative = client.try_deposit(&donor, &-50);
    assert_eq!(result_negative, Err(Ok(EscrowError::InvalidAmount)));
}

#[test]
fn test_milestone_index_out_of_bounds() {
    let env = Env::default();
    env.mock_all_auths();

    let milestone_amounts = Vec::from_array(&env, [100i128]);
    let (_contract_id, client, _token_address, asset_client, _token_client, _recipient, verifiers) =
        setup(&env, milestone_amounts);

    let donor = Address::generate(&env);
    asset_client.mint(&donor, &1000);
    client.deposit(&donor, &100);

    let verifier = verifiers.get(0).unwrap();
    let result = client.try_verify_milestone(&verifier, &5);
    assert_eq!(result, Err(Ok(EscrowError::MilestoneIndexOutOfBounds)));

    let release_result = client.try_release(&5);
    assert_eq!(release_result, Err(Ok(EscrowError::MilestoneIndexOutOfBounds)));
}
