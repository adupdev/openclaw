import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../../agents/agent-scope.js";
import { DEFAULT_PROVIDER } from "../../agents/defaults.js";
import {
  loadModelCatalogForBrowse,
  type ModelCatalogBrowseView,
} from "../../agents/model-catalog-browse.js";
import { resolveVisibleModelCatalog } from "../../agents/model-catalog-visibility.js";
import { resolveDefaultAgentWorkspaceDir } from "../../agents/workspace.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { getCurrentPluginMetadataSnapshot } from "../../plugins/current-plugin-metadata-snapshot.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateModelsListParams,
} from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

type ModelsListView = ModelCatalogBrowseView;

let loggedSlowModelsListCatalog = false;

function resolveModelsListManifestPlugins(params: { cfg: OpenClawConfig; workspaceDir?: string }) {
  const snapshot =
    getCurrentPluginMetadataSnapshot({
      config: params.cfg,
      env: process.env,
      workspaceDir: params.workspaceDir,
      allowWorkspaceScopedSnapshot: true,
    }) ??
    getCurrentPluginMetadataSnapshot({
      env: process.env,
      workspaceDir: params.workspaceDir,
      allowWorkspaceScopedSnapshot: true,
    });
  return snapshot?.plugins;
}

function resolveModelsListView(params: Record<string, unknown>): ModelsListView {
  return typeof params.view === "string" ? (params.view as ModelsListView) : "default";
}

export const modelsHandlers: GatewayRequestHandlers = {
  "models.list": async ({ params, respond, context }) => {
    if (!validateModelsListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid models.list params: ${formatValidationErrors(validateModelsListParams.errors)}`,
        ),
      );
      return;
    }
    try {
      const cfg = context.getRuntimeConfig();
      const workspaceDir =
        resolveAgentWorkspaceDir(cfg, resolveDefaultAgentId(cfg)) ??
        resolveDefaultAgentWorkspaceDir();
      const view = resolveModelsListView(params);
      const catalog = await loadModelCatalogForBrowse({
        cfg,
        view,
        loadCatalog: context.loadGatewayModelCatalog,
        onTimeout: (timeoutMs) => {
          if (loggedSlowModelsListCatalog) {
            return;
          }
          loggedSlowModelsListCatalog = true;
          context.logGateway.debug(
            `models.list continuing without model catalog after ${timeoutMs}ms`,
          );
        },
      });
      if (view === "all") {
        respond(true, { models: catalog }, undefined);
        return;
      }
      const models = await resolveVisibleModelCatalog({
        cfg,
        catalog,
        defaultProvider: DEFAULT_PROVIDER,
        workspaceDir,
        view,
        runtimeAuthDiscovery: false,
        manifestPlugins: resolveModelsListManifestPlugins({
          cfg,
          workspaceDir,
        }),
      });
      respond(true, { models }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};
