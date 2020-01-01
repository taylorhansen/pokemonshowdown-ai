import { datasetFromIteratorFn } from "@tensorflow/tfjs-data/dist/dataset";
import { iteratorFromFunction } from
    "@tensorflow/tfjs-data/dist/iterators/lazy_iterator";
import * as tf from "@tensorflow/tfjs-node";
import { toColumn } from "../../src/ai/Network";
import { Logger } from "../../src/Logger";
import { Experience } from "./battle/Experience";

/**
 * Trains a model from an array of Experience objects.
 * @param model Model to train.
 * @param experiences Experience objects that will be used for each epoch of
 * training.
 * @param gamma Discount factor for calculating Q-values. This is used to scale
 * down future expected rewards so they don't outweigh the immediate gain by
 * too much.
 * @param epochs Number of epochs to run.
 */
export async function learn(model: tf.LayersModel,
    experiences: readonly Experience[], gamma: number, epochs: number,
    logger = Logger.null):
    Promise<tf.History>
{
    logger.debug("Learning (this may take a while)");

    const dataset = datasetFromIteratorFn<tf.TensorContainerObject>(
    async function()
    {
        // create new experience buffer to sample from
        const exp = [...experiences];
        // this iterator should randomly sample objects from the experiences
        //  array and apply the learning algorithm
        return iteratorFromFunction<tf.TensorContainerObject>(async function()
        {
            // done if no more files
            // iterator requires value=null if done, but the tensorflow source
            //  allows implicit null and our tsconfig doesn't, so get around
            //  that by using an any-cast
            if (exp.length <= 0) return {value: null as any, done: true};

            // sample a random Experience object
            // this helps break the correlation between consecutive samples for
            //  better generalization
            const n = Math.floor(Math.random() * exp.length);
            const experience = exp.splice(n, 1)[0];

            const xs = toColumn(experience.state);

            // calculate target Q-value
            // a Q network learns the immediate reward plus a scaled-down total
            //  future reward
            // total future reward is calculated using a recent prediction
            const targetData = await (model.predict(xs) as tf.Tensor2D)
                    .data<"float32">();
            const futureReward = await (model.predict(
                    toColumn(experience.nextState)) as tf.Tensor2D).data();
            targetData[experience.action] = experience.reward +
                // choose future reward given the best action (i.e. max reward)
                gamma * futureReward[experience.nextAction];
            const ys = toColumn(targetData);

            return {value: {xs, ys}, done: false};
        });
    })
        // repeat the process for each epoch
        .repeat(epochs);

    return model.fitDataset(dataset,
        // technically datasets have an unspecified length, but since we know
        //  when it will terminate (end of experience array), we can provide
        //  this info so we get a nice animating progress bar
        {epochs, batchesPerEpoch: experiences.length});
}
