# Soroban wasm `49f8f44b212e9d975a4a35f0da0dad864f1b93394cee17316b6844fbb570a8d8`

> Generated from on-chain data by @sik/wasm-catalog (@sik/wasm-catalog bindings v1, @stellar/stellar-sdk 17.4.0). Every name, doc string and meta value below is copied from the wasm's custom sections, which anyone can write; they are shown inside code spans and blocks and have not been reviewed.

| Property | Value |
|---|---|
| Size | 5006 bytes |
| Code sha256 (custom sections stripped) | `47a8ff116c81e8c3935b5de500b56eb35ae79a6a78d6497a41c202d1be167058` |
| Spec | 12 entries in 1 section(s), 940 bytes |
| Spec sha256 | `4438d372f36d342a504c5648a0afcfe209e7a8d1a6d5688414b03ff86c6bf3c8` |
| Interface sha256 (docs and order ignored) | `279ff2b373b715b7a5fd9db71a3e23abb68699eecb34ffd7ef62bac1a01c3977` |
| Decodes with @stellar/stellar-sdk | spec yes; `Spec.fromWasm` yes; meta yes; env meta yes |
| Env interface version | protocol 28 |
| soroban-sdk (rssdkver) | `28.0.0` |
| Rust (rsver) | `1.98.1` |
| stellar-cli (cliver) | `28.0.0#300aaf69ab100536678bdb641428b06f06b318ea` |
| SEP-47 `sep` | none declared |
| SEP-55 source_repo / home_domain | none / none |
| SEP-58 build fields | none |
| Contracts seen running it | 3 (`CBQEQ3OVWWKMLYHPQK4OJFJG4YDV6U7RNZ236VWT4L326WQOH7ET5BGM`, `CA7TELVQ6D4AQWRAWTD6HUIJUHVHJP2JQBMG2QKZW2XKO4DM6GDTLIUG`, `CDF4I3JEH27NNVZUTVAB66CMOYFVP346EH7KF36KLI6NBQCY2DJ5JHBY`) |
| Harvest sources | `se-contracts`, `rpc-instance` |
| Same interface as | none |
| Same code as | none |
| TypeScript bindings | [bindings.ts](bindings.ts) |

## Functions

### `base`

```rust
fn base() -> Asset
```

### `admin`

```rust
fn admin() -> Address
```

### `decimals`

```rust
fn decimals() -> u32
```

### `lastprice`

```rust
fn lastprice(asset: Asset) -> Option<PriceData>
```

### `set_price`

```rust
fn set_price(caller: Address, asset: Asset, price: Option<i128>)
```

### `resolution`

```rust
fn resolution() -> u32
```

### `set_price_at`

```rust
fn set_price_at(caller: Address, asset: Asset, price: Option<i128>, timestamp: u64)
```

### `__constructor`

```rust
fn __constructor(admin: Address, decimals: u32)
```

## Types

### struct `PriceData`

| Field | Type | Doc |
|---|---|---|
| `price` | `i128` |  |
| `timestamp` | `u64` |  |

### union `Asset`

| Case | Payload | Doc |
|---|---|---|
| `Stellar` | `(Address)` |  |
| `Other` | `(Symbol)` |  |

## Errors

### `DevOracleError`

| Value | Name | Doc |
|---|---|---|
| 1 | `NotAdmin` |  |
| 2 | `NegativePrice` |  |

## Events

### `DevPriceSet`

Prefix topics: `dev_price_set`; data format: `map`

| Param | Type | Location | Doc |
|---|---|---|---|
| `asset` | `Asset` | `topic_list` |  |
| `price` | `Option<i128>` | `data` |  |
| `timestamp` | `u64` | `data` |  |

## Contract meta (contractmetav0)

| Key | Value |
|---|---|
| `rsver` | `1.98.1` |
| `rssdkver` | `28.0.0#48d506712f964094d14176e2f0b02afcd1054567` |
| `rssdk_spec_shaking` | `2` |
| `cliver` | `28.0.0#300aaf69ab100536678bdb641428b06f06b318ea` |
| `license` | `LicenseRef-PSGDigitalLabs-Proprietary` |
| `copyright` | `Copyright (c) 2026 PSG Digital Labs. All rights reserved.` |

## Custom sections

`contractenvmetav0`, `contractmetav0`, `contractmetav0`, `contractspecv0`
