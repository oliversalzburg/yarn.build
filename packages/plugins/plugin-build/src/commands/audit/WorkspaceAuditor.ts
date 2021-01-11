import { Descriptor, Ident, Workspace } from "@yarnpkg/core";
import { FreshnessCatalog } from "./FreshnessCatalog";

/**
 * Contains all the information that was collected during an
 * auditing run of a workspace.
 */
export class WorkspaceReport {
  /**
   * The workspace this report was generated for.
   */
  workspace: Workspace;

  /**
   * Is the workspace fresh overall?
   */
  isFresh: boolean | undefined = undefined;

  /**
   * Does this workspace create a circular dependency by
   * referring to a workspace further up in the tree?
   */
  loopsBackToParent: boolean | undefined = undefined;

  /**
   * When audited, were the dependency workspaces of this
   * workspace determined to be fresh?
   */
  dependenciesWereFresh: boolean | undefined = undefined;

  /**
   * When audited, were the files in the workspace determined
   * to be fresh?
   */
  filesWereFresh: boolean | undefined = undefined;

  /**
   * When the "file freshness" was checked, did we use a result
   * from the catalog that was already cached in the catalog?
   */
  fileFreshnessFromCache: boolean | undefined = undefined;

  /**
   * The reports for the dependency workspaces in this workspace.
   */
  dependencies = new Map<string, WorkspaceReport>();

  /**
   * Construct a `WorkspaceReport` for the given workspace.
   * @param workspace The workspace this report is for.
   */
  constructor(workspace: Workspace) {
    this.workspace = workspace;
  }
}

/**
 * Audits a single workspace for freshness - if there have been changes since
 * a given point in time.
*/
export class WorkspaceAuditor {
  private _workspace: Workspace;

  /**
   * Constructs a new `WorkspaceAuditor`
   * @param workspace The workspace to audit.
   */
  constructor(workspace: Workspace) {
    this._workspace = workspace;
  }

  /**
   * Audit the workspace for freshness and return a report of the findings.
   * @param freshnessCatalog A freshness cache to speed up the process.
   */
  async audit(freshnessCatalog: FreshnessCatalog): Promise<WorkspaceReport> {
    const report = new WorkspaceReport(this._workspace);

    const workspaceIsFresh = await this._auditDependencyWorkspace(
      this._workspace,
      freshnessCatalog,
      new Array<Descriptor>(),
      report
    );
    report.isFresh = workspaceIsFresh;

    return report;
  }

  /**
   * Audit the workspaces our main workspace depends upon.
   * This way we can recursively determine if the entire branch of the project
   * tree is fresh or not.
   * @param workspace The workspace to audit.
   * @param freshnessCatalog The freshness cache.
   * @param path The path on the dependency tree that we're currently traversing.
   * @param report The report for the current workspace.
  */
  private async _auditDependencyWorkspace(
    workspace: Workspace,
    freshnessCatalog: FreshnessCatalog,
    path: Array<Descriptor>,
    report: WorkspaceReport
  ): Promise<boolean> {
    // Assume fresh until checked.
    report.isFresh = true;

    // Check our own files.
    report.fileFreshnessFromCache = freshnessCatalog.wasChecked(workspace);
    const isFresh = await freshnessCatalog.isFresh(workspace);
    report.filesWereFresh = isFresh;
    if (!isFresh) {
      // Our workspace has changed since the last audit.
      report.isFresh = false;
    }

    // Check dependency workspaces.
    report.dependenciesWereFresh = true;
    for (const descriptor of workspace.dependencies.values()) {
      const dependencyWorkspace = this._workspace.project.tryWorkspaceByDescriptor(descriptor);

      // If the dependency is not a workspace, then we don't care about it.
      // We only care about local workspaces with local files that could have
      // been changed by the user.
      if (!dependencyWorkspace) {
        continue;
      }

      const dependencyReport = new WorkspaceReport(dependencyWorkspace);
      report.dependencies.set(workspace.relativeCwd, dependencyReport);

      // If the path we're currently traversing already contains this descriptor,
      // then there's a circular dependency.
      // Note this in the report and abort execution of this branch.
      if (path.includes(descriptor)) {
        dependencyReport.loopsBackToParent = true;
        continue;
      }
      dependencyReport.loopsBackToParent = false;

      path.push(descriptor);
      const isDependencyFresh = await this._auditDependencyWorkspace(
        dependencyWorkspace,
        freshnessCatalog,
        path,
        dependencyReport
      );
      path.pop();

      dependencyReport.dependenciesWereFresh = isDependencyFresh;

      if (!isDependencyFresh) {
        // Some of the files in the dependency workspace, or its nested
        // dependency workspaces, are not fresh. Mark this on the report.
        dependencyReport.isFresh = false;
        report.dependenciesWereFresh = false;
      }

      dependencyReport.fileFreshnessFromCache = freshnessCatalog.wasChecked(dependencyWorkspace);

      const isFresh = await freshnessCatalog.isFresh(dependencyWorkspace);
      dependencyReport.filesWereFresh = isFresh;
      if (!isFresh) {
        // Our workspace has changed since the last audit.
        dependencyReport.isFresh = false;
        report.dependenciesWereFresh = false;
      }
    }

    // Our freshness is defined through the freshness of our dependcies and our files.
    // If either isn't fresh, then we're not either.
    return report.dependenciesWereFresh && report.filesWereFresh;
  }
}
