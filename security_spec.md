# Security Specification - RentFlow Manager

## 1. Data Invariants

- **General Ownership**: Every document (`Property`, `Tenant`, `Lease`, `Payment`) must have a `managerId` field that strictly matches the authenticated user's UID.
- **Property Integrity**: A property type must be one of `HOUSE`, `FLAT`, or `BUSINESS`.
- **Relational Integrity**:
  - `Lease` must reference an existing `Property` and `Tenant`.
  - `Payment` must reference an existing `Lease`.
- **Immutable Fields**: `managerId` and `createdAt` cannot be modified after document creation.
- **Type Safety**:
  - `rentAmount` and `amount` must be numbers > 0.
  - `startDate`, `endDate`, `dueDate` must be valid date strings.
  - `status` fields must restricted to defined enums.

## 2. The "Dirty Dozen" (Attack Payloads)

1. **Identity Theft**: Creating a property with `managerId` of another user.
2. **Shadow Field Injection**: Adding `isPremium: true` to a property document.
3. **Lease Hijacking**: Updating a lease to change the `managerId` to oneself from another user's lease.
4. **Amount Forgery**: Updating a payment status to `PAID` while also changing the `amount` to 0.
5. **Orphaned Lease**: Creating a lease for a `propertyId` that doesn't exist.
6. **Timeline Poisoning**: Setting `createdAt` to a future date instead of `request.time`.
7. **Type Confusion**: Sending `rentAmount: "1000"` (string) instead of a number.
8. **Enum Break**: Setting property type to `CASTLE`.
9. **Blanket Read Attempt**: Trying to list ALL properties without a `managerId` filter.
10. **ID Poisoning**: Creating a property with a 2MB string as its ID.
11. **PII Leak**: Authenticated user 'A' trying to 'get' Tenant 'B' (owned by manager 'C').
12. **Status Shortcut**: Moving a payment from `PENDING` to `OVERDUE` without checking the `dueDate`.

## 3. Test Scenarios

- [ ] `create` Property: Must fail if `managerId != auth.uid`.
- [ ] `update` Lease: Must fail if `rentAmount` is changed by non-owner.
- [ ] `list` Payments: Must fail if not filtered by `managerId == auth.uid`.
- [ ] `delete` Tenant: Must fail if tenant has active leases.
