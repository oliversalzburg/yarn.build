import { Workspace } from "@yarnpkg/core";
import { PortablePath, xfs } from "@yarnpkg/fslib";

/**
 * Detects if a workspace had any modifications since a given point in time.
 * If it had any changes, then it's not "fresh". It needs to be rebuilt.
 */
export class FreshnessDetector {
  private _workspace: Workspace;

  /**
   * Construct a new `FreshnessDetector`
   * @param workspace The workspace to check.
   */
  constructor(workspace: Workspace) {
    this._workspace = workspace;
  }

  /**
   * Determine if the workspace is fresh.
   * @param lastModified The "last modified" time from the previous audit.
  */
  async isFresh(lastModified: number): Promise<boolean> {
    // TODO: This needs to come from configuration.
    //       And it should always include `package.json` somehow.
    const sourceDirectory = xfs.pathUtils.join(this._workspace.cwd, "source" as PortablePath);

    const timeSource = await this._getLastModifiedForFolder(sourceDirectory);

    const changeAge = lastModified - timeSource;

    return changeAge === 0;
  }

  /**
   * Determine the "last modified" time for an entire folder.
   * Whatever is the most recently modified item, will be returned from this call.
   * @param folder The folder to check.
  */
  private async _getLastModifiedForFolder(
    folder: PortablePath,
  ): Promise<number> {
    let lastModified = 0;

    const files = await xfs.readdirPromise(folder);

    for (const file of files) {
      const filePath = xfs.pathUtils.join(folder, file);
      const stat = await xfs.statPromise(filePath);
      if (stat.isFile()) {
        if (stat.mtimeMs > lastModified) {
          lastModified = stat.mtimeMs;
        }
      }
      if (stat.isDirectory()) {
        const folderLastModified = await this._getLastModifiedForFolder(filePath);

        if (folderLastModified > lastModified) {
          lastModified = folderLastModified;
        }
      }
    }

    return lastModified;
  }
}
