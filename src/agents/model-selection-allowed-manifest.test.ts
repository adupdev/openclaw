import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/types.openclaw.js";

const loadManifestMetadataSnapshotMock = vi.hoisted(() => vi.fn());
const getCurrentPluginMetadataSnapshotMock = vi.hoisted(() => vi.fn());
const getActivePluginRegistryWorkspaceDirFromStateMock = vi.hoisted(() => vi.fn());

vi.mock("../plugins/current-plugin-metadata-snapshot.js", () => ({
  getCurrentPluginMetadataSnapshot: getCurrentPluginMetadataSnapshotMock,
}));

vi.mock("../plugins/manifest-contract-eligibility.js", () => ({
  loadManifestMetadataSnapshot: loadManifestMetadataSnapshotMock,
}));

vi.mock("../plugins/runtime-state.js", () => ({
  getActivePluginRegistryWorkspaceDirFromState: getActivePluginRegistryWorkspaceDirFromStateMock,
}));

vi.mock("./provider-model-normalization.runtime.js", () => ({
  normalizeProviderModelIdWithRuntime: () => undefined,
}));

import {
  buildAllowedModelSetWithFallbacks,
  createModelVisibilityPolicyWithFallbacks,
} from "./model-selection-shared.js";

describe("allowed model visibility manifest normalization", () => {
  beforeEach(() => {
    loadManifestMetadataSnapshotMock.mockReset();
    getCurrentPluginMetadataSnapshotMock.mockReset();
    getActivePluginRegistryWorkspaceDirFromStateMock.mockReset();
    getCurrentPluginMetadataSnapshotMock.mockReturnValue(undefined);
    loadManifestMetadataSnapshotMock.mockReturnValue({
      plugins: [
        {
          modelIdNormalization: {
            providers: {
              custom: {
                prefixWhenBare: "workspace-custom",
              },
            },
          },
        },
      ],
    });
  });

  it("reuses one manifest snapshot while parsing configured defaults and fallbacks", () => {
    getActivePluginRegistryWorkspaceDirFromStateMock.mockReturnValue("/workspace/a");
    const cfg = {
      models: {
        providers: {
          custom: {
            api: "openai-completions",
            models: [{ id: "fast-model", name: "Fast Model" }],
          },
        },
      },
      agents: {
        defaults: {
          model: {
            primary: "custom/fast-model",
            fallbacks: ["custom/backup-model"],
          },
          models: {
            "custom/*": {},
            "custom/fast-model": { alias: "fast" },
          },
        },
      },
    } as unknown as OpenClawConfig;

    const allowed = buildAllowedModelSetWithFallbacks({
      cfg,
      catalog: [{ provider: "custom", id: "workspace-custom/fast-model", name: "Fast Model" }],
      defaultProvider: "custom",
      defaultModel: "custom/fast-model",
      fallbackModels: ["custom/backup-model"],
    });

    expect(allowed.allowedKeys.has("custom/workspace-custom/fast-model")).toBe(true);
    expect(allowed.allowedKeys.has("custom/workspace-custom/backup-model")).toBe(true);
    expect(loadManifestMetadataSnapshotMock).toHaveBeenCalledExactlyOnceWith({
      config: cfg,
      workspaceDir: "/workspace/a",
      env: process.env,
    });
  });

  it("reuses one manifest snapshot while creating visibility policies", () => {
    getActivePluginRegistryWorkspaceDirFromStateMock.mockReturnValue("/workspace/a");
    const cfg = {
      models: {
        providers: {
          custom: {
            api: "openai-completions",
            models: [{ id: "fast-model", name: "Fast Model" }],
          },
        },
      },
      agents: {
        defaults: {
          model: {
            primary: "custom/fast-model",
            fallbacks: ["custom/backup-model"],
          },
          models: {
            "custom/*": {},
            "custom/fast-model": { alias: "fast" },
          },
        },
      },
    } as unknown as OpenClawConfig;

    const policy = createModelVisibilityPolicyWithFallbacks({
      cfg,
      catalog: [{ provider: "custom", id: "workspace-custom/fast-model", name: "Fast Model" }],
      defaultProvider: "custom",
      defaultModel: "custom/fast-model",
      fallbackModels: ["custom/backup-model"],
    });

    expect(policy.allows({ provider: "custom", model: "workspace-custom/fast-model" })).toBe(true);
    expect(loadManifestMetadataSnapshotMock).toHaveBeenCalledExactlyOnceWith({
      config: cfg,
      workspaceDir: "/workspace/a",
      env: process.env,
    });
  });
});
