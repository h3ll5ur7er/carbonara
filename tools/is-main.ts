// Whether a module is the script Node was started with. Built with pathToFileURL, not by gluing `file://` to the
// path: on Windows that gives `file://D:\a\…` where the module's URL is `file:///D:/a/…`, and the script would
// quietly do nothing (the desktop release's frontend build did exactly that).
import { pathToFileURL } from "node:url";

export function isMain(moduleUrl: string, script = process.argv[1]): boolean {
  return script !== undefined && moduleUrl === pathToFileURL(script).href;
}
