// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import fetch from "node-fetch";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebApi } from "azure-devops-node-api";
import { z } from "zod";
// import { TestOutcome } from "azure-devops-node-api/interfaces/TestInterfaces.js";

const Test_Log_Tools = {
  testresults_resultsbybuild: "testresults_resultsbybuild",
  testlogs_listbyrun: "testlogs_listbyrun",
  // testattachment_getcontent: "testattachment_getcontent",
  testresults_testlogstoreendpoint: "testresults_testlogstoreendpoint",
};

function configureTestLogTools(
  server: McpServer,
  connectionProvider: () => Promise<WebApi>
) {
  // List test run attachments for a given run
  server.tool(
    Test_Log_Tools.testlogs_listbyrun,
    "Retrieve a list of test run attachments for a given test run using the Azure DevOps TestResults API.",
    {
      project: z.string().describe("The unique identifier (ID or name) of the Azure DevOps project."),
      runId: z.number().describe("The ID of the test run."),
    },
    async ({ project, runId }) => {
      const connection = await connectionProvider();
      const testApi = await connection.getTestApi();
      const attachments = await testApi.getTestRunAttachments(project, runId);
      return {
        content: [{ type: "text", text: JSON.stringify(attachments, null, 2) }],
      };
    }
  );

  // Retrieve test log content via testlogstoreendpoint API and SAS URI
  server.tool(
    Test_Log_Tools.testresults_testlogstoreendpoint,
    "Retrieve the content of a test log file using the testlogstoreendpoint API and SAS URI. Returns the file content as text.",
    {
      project: z.string().describe("The unique identifier (ID or name) of the Azure DevOps project."),
      runId: z.number().describe("The ID of the test run."),
      filePath: z.string().describe("The file path of the attachment (filename, including any subfolders if present)."),
    },
    async ({ project, runId, filePath }) => {
      const connection = await connectionProvider();
      const testResultsApi = await connection.getTestResultsApi();
      const endpointDetails = await testResultsApi.getTestLogStoreEndpointDetailsForRunLog(project, runId, 1, filePath);
      const sasUri = endpointDetails?.endpointSASUri;
      const endpointType = endpointDetails?.endpointType;

      if (!sasUri) {
        return { content: [{ type: "text", text: "No endpointSASUri returned from testlogstoreendpoint API." }] };
      }
      if (endpointType && endpointType !== 2) {
        return { content: [{ type: "text", text: `Endpoint type is not 'file': ${endpointType}` }] };
      }

      // Download the file content from the SAS URI
      const fileResp = await fetch(sasUri);
      if (!fileResp.ok) {
        return { content: [{ type: "text", text: `Failed to download file from SAS URI: ${fileResp.status} ${fileResp.statusText}` }] };
      }
      // Try to decode as text, fallback to base64 if not valid utf8
      const buffer = Buffer.from(await fileResp.arrayBuffer());
      let text = buffer.toString("utf8");
      // If the utf8 string contains many replacement chars, treat as binary
      const nonPrintable = /[\uFFFD]/.test(text) || /[\x00-\x08\x0E-\x1F]/.test(text);
      if (nonPrintable) {
        text = `BASE64:${buffer.toString("base64")}`;
      }
      return { content: [{ type: "text", text }] };
    }
  );
}

export { Test_Log_Tools, configureTestLogTools };
