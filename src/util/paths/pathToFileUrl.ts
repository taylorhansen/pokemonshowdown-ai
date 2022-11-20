import {pathToFileURL} from "url";

// #343: Remove Windows drive letters from pathToFileURL() output since
// Tensorflow ops (e.g. model.save) seem to add them even if they're already
// there, leading to "mkdir C:\C:\..." errors.
const fileUrlDrive = /^file:\/\/\/[A-Z]:\//;
export const pathToFileUrl = (p: string) =>
    pathToFileURL(p).href.replace(fileUrlDrive, "file:///");
