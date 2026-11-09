# Soroban wasm `71648e1b8ee1231ea03c096257ed3c6d55478effbfab77b8e587a5139ab84cbe`

> Generated from on-chain data by @sik/wasm-catalog (@sik/wasm-catalog bindings v1, @stellar/stellar-sdk 17.4.0). Every name, doc string and meta value below is copied from the wasm's custom sections, which anyone can write; they are shown inside code spans and blocks and have not been reviewed.

| Property | Value |
|---|---|
| Size | 9783 bytes |
| Code sha256 (custom sections stripped) | `ca5e4c4b9d88b866252f270f3b69cd5270bd039e57bedb7e92255090b8b58703` |
| Spec | 33 entries in 1 section(s), 2448 bytes |
| Spec sha256 | `8c72e9f7165c6334d77f5f31ef946221b3d0eb90f4c3861def5631a0ba515de6` |
| Interface sha256 (docs and order ignored) | `b2f4e714997bb1ae87f286d6f8ea50d62047224cd0185c79ef1f5c511576301a` |
| Decodes with @stellar/stellar-sdk | spec yes; `Spec.fromWasm` yes; meta yes; env meta yes |
| Env interface version | protocol 22 |
| soroban-sdk (rssdkver) | `22.0.7` |
| Rust (rsver) | `1.81.0` |
| stellar-cli (cliver) | not recorded |
| SEP-47 `sep` | none declared |
| SEP-55 source_repo / home_domain | none / none |
| SEP-58 build fields | none |
| Contracts seen running it | 2 (`CAIC66NQBFB3IWVNFQXV5GRMQ23PPSTF7LYGMOW4GT5UZ3JFH5IOI4X5`, `CBAE3AHYJZ62AXM5IOQRI62RZGHFELQJ4XGJVCSHTAD6OXCV24ISOHMZ`) |
| Harvest sources | `se-contracts` |
| Same interface as | none |
| Same code as | none |
| TypeScript bindings | [bindings.ts](bindings.ts); 1 diagnostic(s), see below |

## Functions

### `allowance`

```rust
fn allowance(from: Address, spender: Address) -> i128
```

### `approve`

```rust
fn approve(from: Address, spender: Address, amount: i128, expiration_ledger: u32)
```

### `balance`

```rust
fn balance(id: Address) -> i128
```

### `transfer`

```rust
fn transfer(from: Address, to: Address, amount: i128)
```

### `transfer_from`

```rust
fn transfer_from(spender: Address, from: Address, to: Address, amount: i128)
```

### `burn`

```rust
fn burn(from: Address, amount: i128)
```

### `burn_from`

```rust
fn burn_from(spender: Address, from: Address, amount: i128)
```

### `decimals`

```rust
fn decimals() -> u32
```

### `name`

```rust
fn name() -> String
```

### `symbol`

```rust
fn symbol() -> String
```

### `token_id`

```rust
fn token_id() -> BytesN<32>
```

### `is_minter`

```rust
fn is_minter(minter: Address) -> bool
```

### `mint_from`

```rust
fn mint_from(minter: Address, to: Address, amount: i128) -> Result<(), ContractError>
```

### `add_minter`

```rust
fn add_minter(minter: Address)
```

### `remove_minter`

```rust
fn remove_minter(minter: Address)
```

### `set_admin`

```rust
fn set_admin(admin: Address)
```

### `admin`

```rust
fn admin() -> Address
```

### `set_authorized`

```rust
fn set_authorized(_id: Address, _authorize: bool)
```

### `authorized`

```rust
fn authorized(_id: Address) -> bool
```

### `mint`

```rust
fn mint(to: Address, amount: i128)
```

### `clawback`

```rust
fn clawback(_from: Address, _amount: i128)
```

### `owner`

```rust
fn owner() -> Address
```

### `transfer_ownership`

```rust
fn transfer_ownership(new_owner: Address)
```

### `__constructor`

```rust
fn __constructor(owner: Address, minter: Option<Address>, token_id: BytesN<32>, token_metadata: TokenMetadata)
```

### `version`

```rust
fn version() -> String
```

### `required_auths`

```rust
fn required_auths() -> Vec<Address>
```

### `upgrade`

```rust
fn upgrade(new_wasm_hash: BytesN<32>)
```

### `migrate`

```rust
fn migrate(migration_data: __InterchainTokenMigrationData) -> Result<(), ContractError>
```

## Types

### struct `AllowanceValue`

| Field | Type | Doc |
|---|---|---|
| `amount` | `i128` |  |
| `expiration_ledger` | `u32` |  |

### struct `AllowanceDataKey`

| Field | Type | Doc |
|---|---|---|
| `from` | `Address` |  |
| `spender` | `Address` |  |

### struct `TokenMetadata`

| Field | Type | Doc |
|---|---|---|
| `decimal` | `u32` |  |
| `name` | `String` |  |
| `symbol` | `String` |  |

### struct `Token`

| Field | Type | Doc |
|---|---|---|
| `address` | `Address` |  |
| `amount` | `i128` |  |

## Errors

### `ContractError`

| Value | Name | Doc |
|---|---|---|
| 1 | `MigrationNotAllowed` |  |
| 2 | `NotMinter` |  |
| 3 | `InvalidAmount` |  |
| 4 | `InvalidExpirationLedger` |  |
| 5 | `InsufficientAllowance` |  |
| 6 | `InsufficientBalance` |  |
| 7 | `MigrationInProgress` |  |
| 8 | `MinterAlreadyExists` |  |

## Contract meta (contractmetav0)

| Key | Value |
|---|---|
| `rsver` | `1.81.0` |
| `rssdkver` | `22.0.7#211569aa49c8d896877dfca1f2eb4fe9071121c8` |

## Custom sections

`contractspecv0`, `contractenvmetav0`, `contractmetav0`

## Binding diagnostics

- `reference to undeclared type "__InterchainTokenMigrationData" mapped to unknown`
