#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, token, Address, Env, Vec};

const LEDGER_THRESHOLD: u32 = 100;
const LEDGER_BUMP: u32 = 518_400; // ~30 days at 5s ledgers

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Milestone {
    pub amount: i128,
    pub verified: bool,
    pub released: bool,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Token,
    Recipient,
    Verifiers,
    Milestones,
    DonorTotal,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum EscrowError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    Unauthorized = 4,
    MilestoneIndexOutOfBounds = 5,
    MilestoneAlreadyVerified = 6,
    MilestoneNotVerified = 7,
    MilestoneAlreadyReleased = 8,
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Atomic constructor (Protocol 22+): sets up a single-campaign escrow.
    /// One instance is deployed per campaign; milestone amounts are fixed here.
    pub fn __constructor(
        env: Env,
        token: Address,
        recipient: Address,
        verifiers: Vec<Address>,
        milestone_amounts: Vec<i128>,
    ) {
        let mut milestones: Vec<Milestone> = Vec::new(&env);
        for amount in milestone_amounts.iter() {
            milestones.push_back(Milestone {
                amount,
                verified: false,
                released: false,
            });
        }

        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Recipient, &recipient);
        env.storage().instance().set(&DataKey::Verifiers, &verifiers);
        env.storage().instance().set(&DataKey::Milestones, &milestones);
        env.storage().instance().set(&DataKey::DonorTotal, &0i128);

        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    /// Donor deposits `amount` of the escrow's token into the contract.
    pub fn deposit(env: Env, donor: Address, amount: i128) -> Result<(), EscrowError> {
        if amount <= 0 {
            return Err(EscrowError::InvalidAmount);
        }

        donor.require_auth();

        let token_id: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(EscrowError::NotInitialized)?;

        let token_client = token::Client::new(&env, &token_id);
        token_client.transfer(&donor, &env.current_contract_address(), &amount);

        let mut donor_total: i128 = env
            .storage()
            .instance()
            .get(&DataKey::DonorTotal)
            .unwrap_or(0);
        donor_total += amount;
        env.storage().instance().set(&DataKey::DonorTotal, &donor_total);

        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);

        Ok(())
    }

    /// Authorized verifier confirms a milestone was met.
    pub fn verify_milestone(env: Env, verifier: Address, index: u32) -> Result<(), EscrowError> {
        verifier.require_auth();

        let verifiers: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Verifiers)
            .ok_or(EscrowError::NotInitialized)?;

        if !verifiers.contains(&verifier) {
            return Err(EscrowError::Unauthorized);
        }

        let mut milestones: Vec<Milestone> = env
            .storage()
            .instance()
            .get(&DataKey::Milestones)
            .ok_or(EscrowError::NotInitialized)?;

        if index >= milestones.len() {
            return Err(EscrowError::MilestoneIndexOutOfBounds);
        }

        let mut milestone = milestones.get(index).unwrap();
        if milestone.verified {
            return Err(EscrowError::MilestoneAlreadyVerified);
        }

        milestone.verified = true;
        milestones.set(index, milestone);
        env.storage().instance().set(&DataKey::Milestones, &milestones);

        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);

        Ok(())
    }

    /// Releases a verified milestone's funds to the recipient.
    /// Intentionally callable by anyone once verified: the verified-state
    /// gate is the authorization boundary, not caller identity, and funds
    /// only ever move to the fixed `Recipient` address, so this is safe.
    pub fn release(env: Env, index: u32) -> Result<(), EscrowError> {
        let mut milestones: Vec<Milestone> = env
            .storage()
            .instance()
            .get(&DataKey::Milestones)
            .ok_or(EscrowError::NotInitialized)?;

        if index >= milestones.len() {
            return Err(EscrowError::MilestoneIndexOutOfBounds);
        }

        let mut milestone = milestones.get(index).unwrap();
        if !milestone.verified {
            return Err(EscrowError::MilestoneNotVerified);
        }
        if milestone.released {
            return Err(EscrowError::MilestoneAlreadyReleased);
        }

        let token_id: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(EscrowError::NotInitialized)?;
        let recipient: Address = env
            .storage()
            .instance()
            .get(&DataKey::Recipient)
            .ok_or(EscrowError::NotInitialized)?;

        let token_client = token::Client::new(&env, &token_id);
        token_client.transfer(&env.current_contract_address(), &recipient, &milestone.amount);

        milestone.released = true;
        milestones.set(index, milestone);
        env.storage().instance().set(&DataKey::Milestones, &milestones);

        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);

        Ok(())
    }

    /// Read-only: current token balance held by this escrow contract.
    pub fn balance(env: Env) -> i128 {
        let token_id: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .expect("not initialized");
        let token_client = token::Client::new(&env, &token_id);
        token_client.balance(&env.current_contract_address())
    }
}

#[cfg(test)]
mod test;
