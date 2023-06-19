"""RNG utilities."""
import tensorflow as tf


def randstr(rng: tf.random.Generator, length: int) -> str:
    """Creates a random string for ids/seeds."""
    return randupper(rng, length).numpy().view(f"S{length}")[0].decode("ascii")


@tf.function(jit_compile=True)
def randupper(rng: tf.random.Generator, length):
    """Creates a random byte tensor of uppercase characters."""
    return tf.cast(
        rng.uniform(
            shape=tf.expand_dims(length, axis=0),
            minval=ord("A"),
            maxval=ord("Z") + 1,
            dtype=tf.int32,
        ),
        tf.uint8,
    )


@tf.function(jit_compile=True)
def make_prng_seeds(rng: tf.random.Generator, num):
    """Creates random seeds for use in the battle sim's PRNG."""
    return rng.uniform(shape=tf.stack([num, 4]), maxval=0x10000, dtype=tf.int32)
