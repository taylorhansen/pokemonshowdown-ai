/** @file Loads chai extensions and sets up configs. */
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";

chai.config.includeStack = true;
chai.use(chaiAsPromised);
