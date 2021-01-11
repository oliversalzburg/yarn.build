import { Workspace } from "@yarnpkg/core";
import { RunLog } from "../supervisor";
import { FreshnessDetector } from "./FreshnessDetector";

/**
 * The catalog holds freshness information and serves as a cache.
 */
export class FreshnessCatalog {
  private _catalog = new Map<Workspace, boolean>();
  private _previousState: RunLog | undefined;

  /**
   * Load the state from the previous run.
   * @param runLog: The log of the previous run.
   */
  async loadPreviousState(runLog: RunLog): Promise<void> {
    this._previousState = runLog;
  }

  /**
   * Check if a given workspace was already checked for freshness.
   * @param workspace The workspace to check.
   */
  wasChecked(workspace: Workspace): boolean {
    return this._catalog.has(workspace);
  }

  /**
   * Determine if a given workspace has had any changes since last audit.
   * @param workspace The workspace to check for freshness.
   */
  async isFresh(workspace: Workspace): Promise<boolean> {
    // If it was already checked, return cached result.
    if (this.wasChecked(workspace)) {
      return this._catalog.get(workspace) as boolean;
    }

    // Read the last timestamp from the build state, if possible.
    let lastModified = new Date().getTime();
    const yarnBuildKey = `${workspace.relativeCwd}#build`;
    if (this._previousState && this._previousState.get(yarnBuildKey)) {
      lastModified = this._previousState.get(yarnBuildKey)?.lastModified ?? new Date().getTime();
    }

    // Run the freshness check on the workspace.
    const detector = new FreshnessDetector(workspace);
    const isFresh = await detector.isFresh(lastModified);
    this._catalog.set(workspace, isFresh);
    return isFresh;
  }
}
