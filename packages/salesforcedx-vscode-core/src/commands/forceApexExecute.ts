/*
 * Copyright (c) 2017, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import {
  Command,
  SfdxCommandBuilder
} from '@salesforce/salesforcedx-utils-vscode/out/src/cli';
import {
  CancelResponse,
  ContinueResponse,
  ParametersGatherer
} from '@salesforce/salesforcedx-utils-vscode/out/src/types';
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import * as vscode from 'vscode';
import { nls } from '../messages';
import { getRootWorkspacePath, hasRootWorkspace, OrgAuthInfo } from '../util';
import {
  SfdxCommandlet,
  SfdxCommandletExecutor,
  SfdxWorkspaceChecker
} from './util';

class ForceApexExecuteExecutor extends SfdxCommandletExecutor<{}> {
  public build(data: TempFile): Command {
    return new SfdxCommandBuilder()
      .withDescription(nls.localize('force_apex_execute_document_text'))
      .withArg('force:apex:execute')
      .withFlag('--apexcodefile', data.fileName)
      .withLogName('force_apex_execute')
      .build();
  }
}

class CreateApexTempFile implements ParametersGatherer<{ fileName: string }> {
  public async gather(): Promise<
    CancelResponse | ContinueResponse<{ fileName: string }>
  > {
    if (hasRootWorkspace()) {
      const fileName = path.join(
        getRootWorkspacePath(),
        '.sfdx',
        'tools',
        'tempApex.input'
      );
      const editor = await vscode.window.activeTextEditor;

      if (!editor) {
        return { type: 'CANCEL' };
      }

      let writeFile;
      const document = editor.document;

      if (editor.selection.isEmpty) {
        writeFile = await writeFileAsync(fileName, document.getText());
      } else {
        writeFile = await writeFileAsync(
          fileName,
          document.getText(editor.selection)
        );
      }

      return writeFile
        ? { type: 'CONTINUE', data: { fileName } }
        : { type: 'CANCEL' };
    }
    return { type: 'CANCEL' };
  }
}

type TempFile = {
  fileName: string;
};

export function writeFileAsync(fileName: string, inputText: string) {
  return new Promise((resolve, reject) => {
    fs.writeFile(fileName, inputText, err => {
      if (err) {
        reject(err);
      } else {
        resolve(true);
      }
    });
  });
}

const workspaceChecker = new SfdxWorkspaceChecker();
const fileNameGatherer = new CreateApexTempFile();

const soapTemplate = `<env:Envelope xmlns:xsd="http://www.w3.org/2001/XMLSchema"
		xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"
		xmlns:cmd="http://soap.sforce.com/2006/08/apex"
		xmlns:apex="http://soap.sforce.com/2006/08/apex">
			<env:Header>
				<cmd:SessionHeader>
					<cmd:sessionId>%s</cmd:sessionId>
				</cmd:SessionHeader>
				%s
			</env:Header>
			<env:Body>
				<%s xmlns="http://soap.sforce.com/2006/08/apex">
				    %s
				</%s>
			</env:Body>
    </env:Envelope>`;

interface ExecAnonResponse {
  result: { column: string };
}

interface CompileProblem {
  compiled: boolean;
  exceptionMessage: {};
  exceptionStackTrace: { line: string; success: boolean };
}

export async function forceApexExecute(filePath: string, withSelection?: any) {
  const gatherer = new CreateApexTempFile();
  const inputs = (await gatherer.gather()) as ContinueResponse<{
    fileName: string;
  }>;
  const fileName = inputs.data.fileName;
  const data = fs.readFileSync(fileName, 'utf8');
  // await commandlet.run();

  /*const editor = await vscode.window.activeTextEditor;
  const document = editor!.document;
  const data = document.getText(editor!.selection);*/

  const usernameOrAlias = await OrgAuthInfo.getDefaultUsernameOrAlias(true);
  if (!usernameOrAlias) {
    throw new Error(nls.localize('error_no_default_username'));
  }
  const connection = await OrgAuthInfo.getConnection(usernameOrAlias);
  // create exec anonymous request
  const action = 'executeAnonymous';
  const debugHeader =
    '<apex:DebuggingHeader><apex:debugLevel>DEBUGONLY</apex:debugLevel></apex:DebuggingHeader>';
  const actionBody = `<apexcode>${data}</apexcode>`;
  const postEndpoint = `${connection.instanceUrl}/services/Soap/s/${
    connection.version
  }/${connection.accessToken.split('!')[0]}`;
  const requestHeaders = {
    'content-type': 'text/xml',
    soapaction: action
  };
  const request = {
    method: 'POST',
    url: postEndpoint,
    body: util.format(
      soapTemplate,
      connection.accessToken,
      debugHeader,
      action,
      actionBody,
      action
    ),
    headers: requestHeaders
  };

  try {
    const result = ((await connection.request(
      request
    )) as unknown) as SoapResponse;
    const formattedResult = await formatResult(result[soapEnv]);
    return formattedResult;
  } catch (e) {
    const message = e.message;
  }
}

const soapEnv = 'soapenv:Envelope';
const soapBody = 'soapenv:Body';
const soapHeader = 'soapenv:Header';

interface SoapResponse {
  [soapEnv]: {
    [soapHeader]: { DebuggingInfo: DebuggingInfo };
    [soapBody]: { executeAnonymousResponse: ExecuteAnonymousResponse };
  };
}

interface ExecuteAnonymousResponse {
  result: {
    column: number;
    compileProblem: { compiled: boolean };
    exceptionMessage: {};
    exceptionStackTrace: { line: number; success: boolean };
  };
}

interface DebuggingInfo {
  debugLog: string;
}

interface FormattedExecAnonResponse {
  result: {
    compiled: boolean;
    compileProblem: string;
    success: boolean;
    line: number;
    column: number;
    exceptionMessage: string;
    exceptionStackTrace: string;
    logs: string;
  };
}

async function formatResult(execAnonResponse: ExecuteAnonymousResponse) {
  const formattedResponse = {
    result: {}
  };
}
