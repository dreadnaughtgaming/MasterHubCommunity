import struct
from .constants import PCG_MULT, PCG_INC, PCG_SEED, MASK64, MASK32, XOR_INIT_CONST

def pcg_next(state):
    """Non-standard PCG XSH-RR 64->32: returns (output_u32, new_state).

    NOTE: The XSH intermediate is NOT masked to 32 bits before rotation.
    The 37-bit value is rotated, then each half is truncated to 32 bits.
    """
    rot = (state >> 59) & 0x1F
    xsh = ((state ^ (state >> 18)) >> 27)  # 37-bit value, NOT masked to 32
    neg_rot = (-rot) & 0x1F
    part1 = (xsh >> rot) & MASK32
    part2 = (xsh << neg_rot) & MASK32
    output = part1 | part2
    new_state = (PCG_MULT * state + PCG_INC) & MASK64
    return output, new_state


def derive_key(indices, xor_mask):
    """Derive a 32-byte key using PCG shuffle + XOR mask."""
    # PCG state is directly initialized (NOT standard PCG seeding)
    state = PCG_SEED

    # Fisher-Yates shuffle on identity permutation (uses % i, not % (i+1))
    perm = list(range(256))
    for i in range(255, 0, -1):
        output, state = pcg_next(state)
        j = output % i
        perm[i], perm[j] = perm[j], perm[i]

    # Build inverse permutation
    inv_perm = [0] * 256
    for i, v in enumerate(perm):
        inv_perm[v] = i

    # Derive key bytes
    key = bytearray(32)
    for k in range(32):
        key[k] = xor_mask[k] ^ inv_perm[indices[k]]
    return bytes(key)


def pcg_advance(state, distance, mult=PCG_MULT, inc=PCG_INC):
    """Advance PCG state by `distance` steps using binary exponentiation."""
    mult_acc = 1
    inc_acc = 0
    cur_mult = mult
    cur_inc = inc
    n = distance & MASK64

    while n > 0:
        if n & 1:
            mult_acc = (mult_acc * cur_mult) & MASK64
            inc_acc = (cur_inc + cur_mult * inc_acc) & MASK64
        cur_inc = (cur_inc * (cur_mult + 1)) & MASK64
        cur_mult = (cur_mult * cur_mult) & MASK64
        n >>= 1

    return (inc_acc + state * mult_acc) & MASK64


def pcg_xor_decrypt(data, seed, file_offset):
    """XOR-decrypt data using PCG stream cipher at the given file offset."""
    if seed == 0:
        return data

    # Initialize PCG state from seed
    state = (PCG_MULT * seed + XOR_INIT_CONST) & MASK64

    # Compute advance distance
    h = seed ^ (seed >> 16)
    h = (h ^ (h >> 32)) & MASK64
    advance_dist = (file_offset + (h & 0xFFFF)) & MASK64

    # Advance state to the correct position
    state = pcg_advance(state, advance_dist)

    # Generate keystream and XOR
    # NOTE: The XSH value is NOT masked to 32 bits - the binary operates on
    # full 64-bit values for the rotation, unlike standard PCG XSH-RR 32.
    result = bytearray(data)
    for i in range(len(result)):
        rot = (state >> 59) & 0x1F
        xsh = ((state ^ (state >> 18)) >> 27)  # 37-bit value, NOT masked to 32
        neg_rot = (-rot) & 0x1F
        output = ((xsh >> rot) | (xsh << neg_rot)) & MASK64
        result[i] ^= output & 0xFF
        state = (PCG_MULT * state + PCG_INC) & MASK64

    return bytes(result)
