/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import { ApexService } from '@salesforce/salesforcedx-apex/packages/apex/lib';
import { languages } from 'vscode';
import { nls } from '../../messages';
import { OrgAuthInfo } from '../../util';
import { LibraryCommandletExecutor } from './libraryCommandlet';

export class ApexLibraryExecutor extends LibraryCommandletExecutor<{
  fileName: string;
}> {
  protected apexService: ApexService | undefined;

  public static errorCollection = languages.createDiagnosticCollection(
    'apex-errors'
  );

  public async build(
    execName: string,
    telemetryLogName: string
  ): Promise<void> {
    this.executionName = execName;
    this.telemetryName = telemetryLogName;

    const usernameOrAlias = await OrgAuthInfo.getDefaultUsernameOrAlias(true);
    if (!usernameOrAlias) {
      throw new Error(nls.localize('error_no_default_username'));
    }
    const conn = await OrgAuthInfo.getConnection(usernameOrAlias);
    this.apexService = new ApexService(conn);
  }
}