const COLLECTIONS = [
  {
    collection: "Author",
    icon: "person",
    note: "Public author records used directly by the CASN website.",
    displayTemplate: "{{displayName}}",
    fields: {
      id: { hidden: true, readonly: true },
      slug: { width: "half", required: true, interface: "input" },
      name: { width: "half", required: true, interface: "input" },
      displayName: { width: "half", required: true, interface: "input" },
      img: { width: "half", interface: "input" },
      bio: { width: "full", interface: "input-multiline" },
      strapiId: { hidden: true, readonly: true },
      sourceHash: { hidden: true, readonly: true },
      publishedAt: { width: "half", interface: "datetime" },
    },
  },
  {
    collection: "Analysis",
    icon: "article",
    note: "Public analysis records. Rows with publishedAt=NULL are hidden from the website.",
    displayTemplate: "{{title}}",
    fields: {
      id: { hidden: true, readonly: true },
      title: { width: "full", required: true, interface: "input" },
      slug: { width: "half", required: true, interface: "input" },
      authorId: {
        width: "half",
        required: true,
        interface: "select-dropdown-m2o",
        special: ["m2o"],
        options: { template: "{{displayName}}" },
      },
      lead: { width: "full", interface: "input-multiline" },
      description: { width: "full", interface: "input-multiline" },
      date: { width: "half", interface: "datetime" },
      category: { width: "half", interface: "input" },
      contentMdx: { width: "full", interface: "input-code", options: { language: "markdown" } },
      strapiId: { hidden: true, readonly: true },
      sourceHash: { hidden: true, readonly: true },
      publishedAt: { width: "half", interface: "datetime" },
    },
  },
  {
    collection: "IssueCollection",
    icon: "folder",
    note: "Public PDF issue collections used by the /zbiory page.",
    displayTemplate: "{{title}}",
    fields: {
      id: { hidden: true, readonly: true },
      year: { width: "half", required: true, interface: "input" },
      title: { width: "half", required: true, interface: "input" },
      fileUrl: { width: "full", required: true, interface: "input" },
      coverUrl: { width: "full", interface: "input" },
      strapiId: { hidden: true, readonly: true },
      sourceHash: { hidden: true, readonly: true },
      publishedAt: { width: "half", interface: "datetime" },
    },
  },
];

const EDITOR_ROLE = {
  name: "CASN Editor",
  icon: "edit",
  description: "CASN editorial users.",
};

const EDITOR_POLICY = {
  name: "CASN Editor Policy",
  icon: "edit",
  description: "Allows CASN editors to manage public content tables.",
  app_access: true,
  admin_access: false,
};

const REVALIDATE_FLOW_NAME = "CASN Revalidate Website Cache";
const REVALIDATE_OPERATION_KEY = "revalidate";

function requiredEnvironment(env, name, aliases = []) {
  for (const candidate of [name, ...aliases]) {
    const value = env[candidate]?.trim();
    if (value) return value;
  }
  throw new Error(`${name} is required for Directus bootstrap`);
}

function readConfiguration(env) {
  return {
    directusUrl: (env.DIRECTUS_INTERNAL_URL || "http://127.0.0.1:8055").replace(/\/+$/, ""),
    adminEmail: requiredEnvironment(env, "ADMIN_EMAIL", ["DIRECTUS_ADMIN_EMAIL"]),
    adminPassword: requiredEnvironment(env, "ADMIN_PASSWORD", ["DIRECTUS_ADMIN_PASSWORD"]),
    revalidateUrl: requiredEnvironment(env, "DIRECTUS_REVALIDATE_URL"),
    revalidateSecret: requiredEnvironment(env, "REVALIDATE_SECRET", ["DIRECTUS_WEBHOOK_SECRET"]),
  };
}

async function requestJson(config, fetchImpl, path, init = {}, token = "") {
  const headers = {
    Accept: "application/json",
    ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers || {}),
  };
  const response = await fetchImpl(`${config.directusUrl}${path}`, {
    ...init,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text();
  let payload = {};

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }

  if (!response.ok) {
    const message = payload?.errors?.[0]?.message || payload?.error || payload?.raw || response.statusText;
    const error = new Error(`${init.method || "GET"} ${path} failed: ${response.status} ${message}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function waitForDirectus(config, fetchImpl, sleep, attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await requestJson(config, fetchImpl, "/server/ping");
      return;
    } catch (error) {
      if (attempt === attempts - 1) throw error;
      await sleep(2000);
    }
  }
}

async function login(config, fetchImpl) {
  const payload = await requestJson(config, fetchImpl, "/auth/login", {
    method: "POST",
    body: { email: config.adminEmail, password: config.adminPassword },
  });
  const token = payload?.data?.access_token;
  if (!token) throw new Error("Directus login did not return an access token");
  return token;
}

async function patchCollection(config, fetchImpl, token, collectionConfig) {
  await requestJson(
    config,
    fetchImpl,
    `/collections/${encodeURIComponent(collectionConfig.collection)}`,
    {
      method: "PATCH",
      body: {
        meta: {
          hidden: false,
          singleton: false,
          icon: collectionConfig.icon,
          note: collectionConfig.note,
          display_template: collectionConfig.displayTemplate,
        },
      },
    },
    token,
  );
}

async function patchField(config, fetchImpl, token, collection, field, metadata) {
  await requestJson(
    config,
    fetchImpl,
    `/fields/${encodeURIComponent(collection)}/${encodeURIComponent(field)}`,
    {
      method: "PATCH",
      body: {
        meta: {
          hidden: Boolean(metadata.hidden),
          readonly: Boolean(metadata.readonly),
          required: Boolean(metadata.required),
          width: metadata.width || "full",
          interface: metadata.interface,
          special: metadata.special,
          options: metadata.options,
        },
      },
    },
    token,
  );
}

async function findOne(config, fetchImpl, token, path, filters) {
  const params = new URLSearchParams({ limit: "2" });
  for (const [field, value] of Object.entries(filters)) {
    params.set(`filter[${field}][_eq]`, value);
  }
  const payload = await requestJson(config, fetchImpl, `${path}?${params.toString()}`, {}, token);
  if ((payload?.data?.length || 0) > 1) {
    throw new Error(`Multiple Directus records match stable key for ${path}`);
  }
  return payload?.data?.[0] || null;
}

async function ensureNamedRecord(config, fetchImpl, token, path, body) {
  const existing = await findOne(config, fetchImpl, token, path, { name: body.name });
  if (existing?.id) {
    await requestJson(config, fetchImpl, `${path}/${existing.id}`, { method: "PATCH", body }, token);
    return existing.id;
  }
  const created = await requestJson(config, fetchImpl, path, { method: "POST", body }, token);
  if (!created?.data?.id) throw new Error(`Directus ${path} create did not return an id`);
  return created.data.id;
}

async function ensurePolicyAccess(config, fetchImpl, token, roleId, policyId) {
  const existing = await findOne(config, fetchImpl, token, "/access", {
    role: roleId,
    policy: policyId,
  });
  const body = { role: roleId, policy: policyId, sort: null };
  if (existing?.id) {
    await requestJson(config, fetchImpl, `/access/${existing.id}`, { method: "PATCH", body }, token);
    return;
  }
  await requestJson(config, fetchImpl, "/access", { method: "POST", body }, token);
}

async function ensurePermission(config, fetchImpl, token, policyId, collectionConfig, action) {
  const { collection } = collectionConfig;
  const existing = await findOne(config, fetchImpl, token, "/permissions", {
    policy: policyId,
    collection,
    action,
  });
  const body = {
    policy: policyId,
    collection,
    action,
    permissions: null,
    validation: null,
    presets: null,
    fields: ["*"],
  };
  if (existing?.id) {
    await requestJson(config, fetchImpl, `/permissions/${existing.id}`, { method: "PATCH", body }, token);
    return;
  }
  await requestJson(config, fetchImpl, "/permissions", { method: "POST", body }, token);
}

async function ensureEditorAccess(config, fetchImpl, token) {
  const roleId = await ensureNamedRecord(config, fetchImpl, token, "/roles", EDITOR_ROLE);
  const policyId = await ensureNamedRecord(config, fetchImpl, token, "/policies", EDITOR_POLICY);
  await ensurePolicyAccess(config, fetchImpl, token, roleId, policyId);
  for (const collectionConfig of COLLECTIONS) {
    for (const action of ["read", "create", "update", "delete"]) {
      await ensurePermission(config, fetchImpl, token, policyId, collectionConfig, action);
    }
  }
}

async function ensureRevalidateFlow(config, fetchImpl, token) {
  const flowBody = {
    name: REVALIDATE_FLOW_NAME,
    icon: "refresh",
    color: "#6644ff",
    description: "Calls the Next.js revalidation endpoint when public content changes.",
    status: "active",
    trigger: "event",
    accountability: "all",
    options: {
      type: "action",
      scope: ["items.create", "items.update", "items.delete"],
      collections: COLLECTIONS.map(({ collection }) => collection),
    },
  };
  const flowId = await ensureNamedRecord(config, fetchImpl, token, "/flows", flowBody);
  const existingOperation = await findOne(config, fetchImpl, token, "/operations", {
    flow: flowId,
    key: REVALIDATE_OPERATION_KEY,
  });
  const operationBody = {
    name: "Call Next.js revalidate",
    key: REVALIDATE_OPERATION_KEY,
    type: "request",
    position_x: 16,
    position_y: 1,
    options: {
      url: config.revalidateUrl,
      method: "POST",
      headers: [
        { header: "Content-Type", value: "application/json" },
        { header: "x-directus-secret", value: config.revalidateSecret },
      ],
      body: {
        model: "{{$trigger.collection}}",
        event: "{{$trigger.event}}",
        key: "{{$trigger.key}}",
        keys: "{{$trigger.keys}}",
      },
    },
    flow: flowId,
  };
  let operationId;
  if (existingOperation?.id) {
    await requestJson(
      config,
      fetchImpl,
      `/operations/${existingOperation.id}`,
      { method: "PATCH", body: operationBody },
      token,
    );
    operationId = existingOperation.id;
  } else {
    const created = await requestJson(
      config,
      fetchImpl,
      "/operations",
      { method: "POST", body: operationBody },
      token,
    );
    operationId = created?.data?.id;
  }
  if (!operationId) throw new Error("Unable to resolve revalidation operation id");
  await requestJson(config, fetchImpl, `/flows/${flowId}`, {
    method: "PATCH",
    body: { operation: operationId },
  }, token);
}

async function runBootstrap({
  env = process.env,
  fetchImpl = globalThis.fetch,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  const config = readConfiguration(env);
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required");
  await waitForDirectus(config, fetchImpl, sleep);
  const token = await login(config, fetchImpl);

  for (const collectionConfig of COLLECTIONS) {
    await patchCollection(config, fetchImpl, token, collectionConfig);
    console.log(`[directus-bootstrap] collection ${collectionConfig.collection} configured`);
    for (const [field, metadata] of Object.entries(collectionConfig.fields)) {
      await patchField(config, fetchImpl, token, collectionConfig.collection, field, metadata);
    }
  }
  await ensureEditorAccess(config, fetchImpl, token);
  await ensureRevalidateFlow(config, fetchImpl, token);
  console.log("[directus-bootstrap] configuration complete");
}

module.exports = { runBootstrap };

if (require.main === module) {
  runBootstrap().catch((error) => {
    console.error("[directus-bootstrap] failed:", error);
    process.exitCode = 1;
  });
}
