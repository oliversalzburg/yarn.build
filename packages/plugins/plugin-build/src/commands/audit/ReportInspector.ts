import { Workspace } from "@yarnpkg/core";
import { ProjectReport } from "./ProjectAuditor";
import { WorkspaceReport } from "./WorkspaceAuditor";

/**
 * Just a dummy wrapper for a more complex build instruction.
 */
export type BuildInstruction = {
  workspace: Workspace;
};

/**
 * Inspects an audit report and constructs build instructions from it.
 * The idea is that if a project isn't fresh, it needs to be rebuilt.
 * For it to be rebuilt, everything that it depends on (which isn't fresh)
 * also needs to be rebuilt.
 * We want to know all the things that need to be rebuilt.
*/
export class ReportInspector {
  private _report: ProjectReport;

  /**
   * Construct a new `ReportInspector`
   * @param report The report to inspect.
   */
  constructor(report: ProjectReport) {
    this._report = report;
  }

  /**
   * Unroll the report into individual build instructions.
   * Note that these instructions are not deduplicated!
   */
  unroll(): Array<BuildInstruction> {
    const instructions = new Array<BuildInstruction>();
    for (const [workspace, workspaceReport] of this._report) {
      this._unrollWorkspaceReport(workspaceReport, instructions);
    }
    return instructions;
  }

  /**
   * Unroll the build instructions from a workspace report.
   * @param workspaceReport The report to unroll.
   * @param instructions The instructions collected so far.
  */
  private _unrollWorkspaceReport(
    workspaceReport: WorkspaceReport,
    instructions: Array<BuildInstruction>
  ): void {
    if (workspaceReport.loopsBackToParent) {
      return;
    }

    if (workspaceReport.isFresh) {
      return;
    }

    if (!workspaceReport.dependenciesWereFresh) {
      // Build us.
      instructions.push({
        workspace: workspaceReport.workspace,
      });

      // And the dependencies that caused this.
      for (const [dependency, dependencyReport] of workspaceReport.dependencies) {
        this._unrollWorkspaceReport(dependencyReport, instructions);
      }
    } else if (!workspaceReport.filesWereFresh) {
      instructions.push({
        workspace: workspaceReport.workspace,
      });
    }
  }
}
