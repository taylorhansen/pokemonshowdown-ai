import Long from "long";
import * as tfrecord from "tfrecord";
import { AugmentedExperience } from "../nn/learn/AugmentedExperience";

/** CRC32C byte length. */
export const crcBytes = 4;
/** Metadata length number byte length. */
export const lengthBytes = 8;

/** Total bytes for the header. */
export const headerBytes = lengthBytes + crcBytes;
/** Total bytes for the footer. */
export const footerBytes = crcBytes;

/**
 * Converts a tfrecord Example into an AugmentedExperience.
 * @param example Example to decode.
 * @returns An AugmentedExperience.
 * @throws Error if the Example is invalid for decoding.
 */
export function exampleToAExp(example: tfrecord.Example): AugmentedExperience
{
    const featureMap = example.features?.feature;
    if (!featureMap) throw new Error("AExp Example has no features");
    return {
        action: getUint32(featureMap, "action"),
        advantage: getFloat(featureMap, "advantage"),
        probs: getFloats(featureMap, "probs"),
        returns: getFloat(featureMap, "returns"),
        state: getFloats(featureMap, "state"),
        value: getFloat(featureMap, "value")
    };
}

function getUint32(featureMap: {[k: string]: tfrecord.protos.IFeature},
    key: string): number
{
    const value = featureMap[key]?.int64List?.value;
    if (!value) throw new Error(`AExp Example must have int64List '${key}'`);
    if (value.length !== 1)
    {
        throw new Error(`int64List '${key}' must have one value`);
    }

    const v = value[0];
    if (Long.isLong(v)) return v.getLowBitsUnsigned();
    else return v;
}

function getFloat(featureMap: {[k: string]: tfrecord.protos.IFeature},
    key: string): number
{
    const value = featureMap[key]?.floatList?.value;
    if (!value) throw new Error(`AExp Example must have floatList '${key}'`);
    if (value.length !== 1)
    {
        throw new Error(`floatList '${key}' must have one value`);
    }

    return value[0];
}

function getFloats(featureMap: {[k: string]: tfrecord.protos.IFeature},
    key: string): Float32Array
{
    const value = featureMap[key]?.floatList?.value;
    if (!value) throw new Error(`AExp Example must have floatList '${key}'`);
    return new Float32Array(value);
}
