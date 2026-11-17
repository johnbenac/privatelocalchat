var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __knownSymbol = (name, symbol) => (symbol = Symbol[name]) ? symbol : Symbol.for("Symbol." + name);
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};
var __await = function(promise, isYieldStar) {
  this[0] = promise;
  this[1] = isYieldStar;
};
var __asyncGenerator = (__this, __arguments, generator) => {
  var resume = (k, v, yes, no) => {
    try {
      var x = generator[k](v), isAwait = (v = x.value) instanceof __await, done = x.done;
      Promise.resolve(isAwait ? v[0] : v).then((y) => isAwait ? resume(k === "return" ? k : "next", v[1] ? { done: y.done, value: y.value } : y, yes, no) : yes({ value: y, done })).catch((e) => resume("throw", e, yes, no));
    } catch (e) {
      no(e);
    }
  }, method = (k) => it[k] = (x) => new Promise((yes, no) => resume(k, x, yes, no)), it = {};
  return generator = generator.apply(__this, __arguments), it[__knownSymbol("asyncIterator")] = () => it, method("next"), method("throw"), method("return"), it;
};
var __forAwait = (obj, it, method) => (it = obj[__knownSymbol("asyncIterator")]) ? it.call(obj) : (obj = obj[__knownSymbol("iterator")](), it = {}, method = (key, fn) => (fn = obj[key]) && (it[key] = (arg) => new Promise((yes, no, done) => (arg = fn.call(obj, arg), done = arg.done, Promise.resolve(arg.value).then((value) => yes({ value, done }), no)))), method("next"), method("return"), it);
var GLUE_VERSION = 1;
var GLUE_MESSAGE_PROTOTYPES = {
  "erro_evt": {
    "name": "erro_evt",
    "structName": "glue_msg_error",
    "className": "GlueMsgError",
    "fields": [
      {
        "type": "str",
        "name": "message",
        "isNullable": false
      }
    ]
  },
  "load_req": {
    "name": "load_req",
    "structName": "glue_msg_load_req",
    "className": "GlueMsgLoadReq",
    "fields": [
      {
        "type": "arr_str",
        "name": "model_paths",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "mmproj_path",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "n_ctx_auto",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "use_mmap",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "use_mlock",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_gpu_layers",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_ctx",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_threads",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "model_alias",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "log_level",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "embeddings",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "offload_kqv",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "n_batch",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "n_ubatch",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "n_parallel",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "pooling_type",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "rope_scaling_type",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "rope_freq_base",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "rope_freq_scale",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "yarn_ext_factor",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "yarn_attn_factor",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "yarn_beta_fast",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "yarn_beta_slow",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "yarn_orig_ctx",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "cache_type_k",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "cache_type_v",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "kv_unified",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "flash_attn",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "swa_full",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "n_ctx_checkpoints",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "checkpoint_min_step",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "chat_template",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "jinja",
        "isNullable": true
      },
      {
        "type": "arr_str",
        "name": "default_template_kwargs_keys",
        "isNullable": true
      },
      {
        "type": "arr_str",
        "name": "default_template_kwargs_vals",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "reasoning",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "image_min_tokens",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "image_max_tokens",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "warmup",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "no_kv_offload",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "mmproj_offload",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "cont_batching",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "n_keep",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "ctx_shift",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "cache_idle_slots",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "n_cache_reuse",
        "isNullable": true
      },
      {
        "type": "arr_str",
        "name": "lora_paths",
        "isNullable": true
      },
      {
        "type": "arr_float",
        "name": "lora_scales",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "lora_init_without_apply",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "spec_draft_model",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "spec_draft_ngl",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "spec_draft_n_max",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "spec_draft_n_min",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "spec_draft_p_min",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "spec_draft_threads",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "spec_draft_threads_batch",
        "isNullable": true
      },
      {
        "type": "arr_str",
        "name": "kv_overrides_keys",
        "isNullable": true
      },
      {
        "type": "arr_str",
        "name": "kv_overrides_vals",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "reasoning_budget_tokens",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "reasoning_budget_message",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "reasoning_format",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "skip_chat_parsing",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "prefill_assistant",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "n_outputs_max",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "flash_attn_policy",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "fused_gdn_ar",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "fused_gdn_ch",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "fused_gdn_auto",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "sched_max_splits_hint",
        "isNullable": true
      }
    ]
  },
  "load_res": {
    "name": "load_res",
    "structName": "glue_msg_load_res",
    "className": "GlueMsgLoadRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_ctx",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_batch",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_ubatch",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_vocab",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_ctx_train",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_embd",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_layer",
        "isNullable": false
      },
      {
        "type": "arr_str",
        "name": "metadata_key",
        "isNullable": false
      },
      {
        "type": "arr_str",
        "name": "metadata_val",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "token_bos",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "token_eos",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "token_eot",
        "isNullable": false
      },
      {
        "type": "arr_int",
        "name": "list_tokens_eog",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "add_bos_token",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "add_eos_token",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "has_encoder",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "token_decoder_start",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "media_marker",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "has_image_input",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "has_audio_input",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_outputs_max",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "sched_max_splits_hint",
        "isNullable": false
      }
    ]
  },
  "cmpl_req": {
    "name": "cmpl_req",
    "structName": "glue_msg_completion_req",
    "className": "GlueMsgCompletionReq",
    "fields": [
      {
        "type": "bool",
        "name": "is_chat",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "data_json",
        "isNullable": false
      },
      {
        "type": "arr_raw",
        "name": "files",
        "isNullable": false
      }
    ]
  },
  "cmpl_res": {
    "name": "cmpl_res",
    "structName": "glue_msg_completion_res",
    "className": "GlueMsgCompletionRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      }
    ]
  },
  "tokn_req": {
    "name": "tokn_req",
    "structName": "glue_msg_token_count_req",
    "className": "GlueMsgTokenCountReq",
    "fields": [
      {
        "type": "str",
        "name": "text",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "add_special",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "parse_special",
        "isNullable": false
      }
    ]
  },
  "tokn_res": {
    "name": "tokn_res",
    "structName": "glue_msg_token_count_res",
    "className": "GlueMsgTokenCountRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "token_count",
        "isNullable": false
      }
    ]
  },
  "embd_req": {
    "name": "embd_req",
    "structName": "glue_msg_embedding_req",
    "className": "GlueMsgEmbeddingReq",
    "fields": [
      {
        "type": "str",
        "name": "data_json",
        "isNullable": false
      },
      {
        "type": "arr_raw",
        "name": "files",
        "isNullable": false
      }
    ]
  },
  "embd_res": {
    "name": "embd_res",
    "structName": "glue_msg_embedding_res",
    "className": "GlueMsgEmbeddingRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      }
    ]
  },
  "rrnk_req": {
    "name": "rrnk_req",
    "structName": "glue_msg_rerank_req",
    "className": "GlueMsgRerankReq",
    "fields": [
      {
        "type": "str",
        "name": "data_json",
        "isNullable": false
      }
    ]
  },
  "rrnk_res": {
    "name": "rrnk_res",
    "structName": "glue_msg_rerank_res",
    "className": "GlueMsgRerankRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      }
    ]
  },
  "gres_req": {
    "name": "gres_req",
    "structName": "glue_msg_get_result_req",
    "className": "GlueMsgGetResultReq",
    "fields": []
  },
  "gres_res": {
    "name": "gres_res",
    "structName": "glue_msg_get_result_res",
    "className": "GlueMsgGetResultRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "has_more",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "is_error",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "data_json",
        "isNullable": false
      }
    ]
  },
  "diag_req": {
    "name": "diag_req",
    "structName": "glue_msg_get_diagnostics_req",
    "className": "GlueMsgGetDiagnosticsReq",
    "fields": []
  },
  "diag_res": {
    "name": "diag_res",
    "structName": "glue_msg_get_diagnostics_res",
    "className": "GlueMsgGetDiagnosticsRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "has_receipt",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "data_json",
        "isNullable": false
      }
    ]
  },
  "tbop_req": {
    "name": "tbop_req",
    "structName": "glue_msg_test_backend_ops_req",
    "className": "GlueMsgTestBackendOpsReq",
    "fields": [
      {
        "type": "arr_str",
        "name": "args",
        "isNullable": false
      }
    ]
  },
  "tbop_res": {
    "name": "tbop_res",
    "structName": "glue_msg_test_backend_ops_res",
    "className": "GlueMsgTestBackendOpsRes",
    "fields": [
      {
        "type": "int",
        "name": "retcode",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      }
    ]
  }
};
var WIRE_SCHEMA_GENERATION_BY_BUILD_PREFIX = Object.freeze({
  "retained-v1j": "glue-v1:68/22",
  "retained-v1k": "glue-v1:68/22",
  "retained-v1l": "glue-v1:69/23",
  // The s17 product-slim build compiles the unchanged v1l positional GLUE
  // tail: 69 load-request fields and 23 load-response fields. Admit only the
  // attested dated build, not the retained-v1m family or an unpinned suffix.
  "retained-v1m-slim-20260831": "glue-v1:69/23",
  // The s29 streaming rebuild is attested against the same positional GLUE
  // schema. Keep it exact-only via EXACT_WIRE_SCHEMA_BUILD_IDS below.
  "retained-v1n-stream-slim-20260901T073847Z": "glue-v1:69/23",
  "retained-v1p-checkpoint-slim-20260901T183523Z": "glue-v1:69/23",
  "retained-v1q-chat-stable-slim-20260901": "glue-v1:69/23",
  "privatelocalchat-owner-cleanup-debug-20261030-v1": "glue-v1:69/23"
});
var EXACT_WIRE_SCHEMA_BUILD_IDS = new Set(["retained-v1m-slim-20260831", "retained-v1n-stream-slim-20260901T073847Z", "retained-v1p-checkpoint-slim-20260901T183523Z", "retained-v1q-chat-stable-slim-20260901", "privatelocalchat-owner-cleanup-debug-20261030-v1"]);
function parseWireSchemaGeneration(generation) {
  const match = /^glue-v(\d+):(\d+)\/(\d+)$/.exec(generation || "");
  if (!match) throw new Error(`invalid-wire-schema-generation: ${generation}`);
  return {
    wireVersion: Number(match[1]),
    reqFields: Number(match[2]),
    resFields: Number(match[3])
  };
}
var KNOWN_RUNTIME_WIRE_PAIRINGS = Object.freeze(Object.fromEntries(
  Object.entries(WIRE_SCHEMA_GENERATION_BY_BUILD_PREFIX).map(([buildIdPrefix, generation]) => [
    buildIdPrefix,
    Object.freeze({ generation, ...parseWireSchemaGeneration(generation) })
  ])
));
function runtimeWireSchemaIdentity(expectedRuntimeBuildId) {
  const buildId = typeof expectedRuntimeBuildId === "string" ? expectedRuntimeBuildId : "";
  const expectedRuntimeBuildPrefix = Object.keys(WIRE_SCHEMA_GENERATION_BY_BUILD_PREFIX)
    .find((prefix) => buildId === prefix ||
      !EXACT_WIRE_SCHEMA_BUILD_IDS.has(prefix) && buildId.startsWith(`${prefix}-`)) || null;
  const expected = expectedRuntimeBuildPrefix ? KNOWN_RUNTIME_WIRE_PAIRINGS[expectedRuntimeBuildPrefix] : null;
  const mirrorReqFields = GLUE_MESSAGE_PROTOTYPES.load_req.fields.length;
  const mirrorResFields = GLUE_MESSAGE_PROTOTYPES.load_res.fields.length;
  return {
    expectedRuntimeBuildId: buildId || null,
    expectedRuntimeBuildPrefix,
    expectedGeneration: expected?.generation || null,
    expectedWireVersion: expected?.wireVersion ?? null,
    expectedReqFields: expected?.reqFields ?? null,
    expectedResFields: expected?.resFields ?? null,
    mirrorWireVersion: GLUE_VERSION,
    mirrorReqFields,
    mirrorResFields,
    // Native-published field counts and feature bits are the follow-up when
    // the next runtime rebuild can add them to wllama.start/module-init. Until
    // then the configured build identity selects this shipped pairing table.
    featureBits: null,
    match: Boolean(expected)
      && expected.wireVersion === GLUE_VERSION
      && expected.reqFields === mirrorReqFields
      && expected.resFields === mirrorResFields
  };
}
function assertRuntimeWireSchema(expectedRuntimeBuildId) {
  const identity = runtimeWireSchemaIdentity(expectedRuntimeBuildId);
  if (identity.match) return identity;
  const expected = identity.expectedRuntimeBuildPrefix
    ? `${identity.expectedRuntimeBuildPrefix} ${identity.expectedGeneration} (load_req=${identity.expectedReqFields}, load_res=${identity.expectedResFields})`
    : `unknown build ${JSON.stringify(identity.expectedRuntimeBuildId)}`;
  const error = new Error(
    `wire-schema-mismatch: expected runtime ${expected}; page mirror GLUE v${identity.mirrorWireVersion} (load_req=${identity.mirrorReqFields}, load_res=${identity.mirrorResFields})`
  );
  error.name = "WireSchemaMismatchError";
  error.code = "wire-schema-mismatch";
  error.details = identity;
  throw error;
}
var GLUE_MAGIC = new Uint8Array([71, 76, 85, 69]);
var GLUE_DTYPE_NULL = 0;
var GLUE_DTYPE_BOOL = 1;
var GLUE_DTYPE_INT = 2;
var GLUE_DTYPE_FLOAT = 3;
var GLUE_DTYPE_STRING = 4;
var GLUE_DTYPE_RAW = 5;
var GLUE_DTYPE_ARRAY_BOOL = 6;
var GLUE_DTYPE_ARRAY_INT = 7;
var GLUE_DTYPE_ARRAY_FLOAT = 8;
var GLUE_DTYPE_ARRAY_STRING = 9;
var GLUE_DTYPE_ARRAY_RAW = 10;
var TYPE_MAP = {
  str: GLUE_DTYPE_STRING,
  int: GLUE_DTYPE_INT,
  float: GLUE_DTYPE_FLOAT,
  bool: GLUE_DTYPE_BOOL,
  raw: GLUE_DTYPE_RAW,
  arr_str: GLUE_DTYPE_ARRAY_STRING,
  arr_int: GLUE_DTYPE_ARRAY_INT,
  arr_float: GLUE_DTYPE_ARRAY_FLOAT,
  arr_bool: GLUE_DTYPE_ARRAY_BOOL,
  arr_raw: GLUE_DTYPE_ARRAY_RAW,
  null: GLUE_DTYPE_NULL
};
function glueDeserialize(buf) {
  let offset = 0;
  const view = new DataView(buf.buffer);
  const readUint32 = () => {
    const value = view.getUint32(offset, true);
    offset += 4;
    return value;
  };
  const readInt32 = () => {
    const value = view.getInt32(offset, true);
    offset += 4;
    return value;
  };
  const readFloat = () => {
    const value = view.getFloat32(offset, true);
    offset += 4;
    return value;
  };
  const readBool = () => {
    return readUint32() !== 0;
  };
  const readString = (customLen) => {
    const length = customLen != null ? customLen : readUint32();
    const value = new TextDecoder().decode(buf.slice(offset, offset + length));
    offset += length;
    return value;
  };
  const readRaw = () => {
    const length = readUint32();
    const value = buf.slice(offset, offset + length);
    offset += length;
    return value;
  };
  const readArray = (readItem) => {
    const length = readUint32();
    const value = new Array(length);
    for (let i = 0; i < length; i++) {
      value[i] = readItem();
    }
    return value;
  };
  const readNull = () => null;
  const readField = (field) => {
    switch (field.type) {
      case "str":
        return readString();
      case "int":
        return readInt32();
      case "float":
        return readFloat();
      case "bool":
        return readBool();
      case "raw":
        return readRaw();
      case "arr_str":
        return readArray(readString);
      case "arr_int":
        return readArray(readInt32);
      case "arr_float":
        return readArray(readFloat);
      case "arr_bool":
        return readArray(readBool);
      case "arr_raw":
        return readArray(readRaw);
      case "null":
        return readNull();
    }
  };
  const magicValid = buf[0] === GLUE_MAGIC[0] && buf[1] === GLUE_MAGIC[1] && buf[2] === GLUE_MAGIC[2] && buf[3] === GLUE_MAGIC[3];
  offset += 4;
  if (!magicValid) {
    throw new Error("Invalid magic number");
  }
  const version = readUint32();
  if (version !== GLUE_VERSION) {
    throw new Error("Invalid version number");
  }
  const name = readString(8);
  const msgProto = GLUE_MESSAGE_PROTOTYPES[name];
  if (!msgProto) {
    throw new Error(`Unknown message name: ${name}`);
  }
  const output = { _name: name };
  for (const field of msgProto.fields) {
    const readType = readUint32();
    if (readType === GLUE_DTYPE_NULL) {
      if (!field.isNullable) {
        throw new Error(
          `${name}: Expect field ${field.name} to be non-nullable`
        );
      }
      output[field.name] = null;
      continue;
    }
    if (readType !== TYPE_MAP[field.type]) {
      throw new Error(
        `${name}: Expect field ${field.name} to have type ${field.type}`
      );
    }
    output[field.name] = readField(field);
  }
  return output;
}
function glueSerialize(msg) {
  const msgProto = GLUE_MESSAGE_PROTOTYPES[msg._name];
  if (!msgProto) {
    throw new Error(`Unknown message name: ${msg._name}`);
  }
  const bufs = [];
  const writeUint32 = (value) => {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setUint32(0, value, true);
    bufs.push(new Uint8Array(buf));
  };
  const writeInt32 = (value) => {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setInt32(0, value, true);
    bufs.push(new Uint8Array(buf));
  };
  const writeFloat = (value) => {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, value, true);
    bufs.push(new Uint8Array(buf));
  };
  const writeBool = (value) => {
    writeUint32(value ? 1 : 0);
  };
  const writeString = (value) => {
    const utf8 = new TextEncoder().encode(value);
    writeUint32(utf8.byteLength);
    bufs.push(utf8);
  };
  const writeRaw = (value) => {
    writeUint32(value.byteLength);
    bufs.push(value);
  };
  const writeArray = (value, writeItem) => {
    writeUint32(value.length);
    for (const item of value) {
      writeItem(item);
    }
  };
  const writeNull = () => {
  };
  bufs.push(GLUE_MAGIC);
  writeUint32(GLUE_VERSION);
  {
    const utf8 = new TextEncoder().encode(msg._name);
    bufs.push(utf8);
  }
  for (const field of msgProto.fields) {
    const val = msg[field.name];
    if (!field.isNullable && (val === null || val === void 0)) {
      throw new Error(
        `${msg._name}: Expect field ${field.name} to be non-nullable`
      );
    }
    if (val === null || val === void 0) {
      writeUint32(GLUE_DTYPE_NULL);
      continue;
    }
    writeUint32(TYPE_MAP[field.type]);
    switch (field.type) {
      case "str":
        writeString(val);
        break;
      case "int":
        writeInt32(val);
        break;
      case "float":
        writeFloat(val);
        break;
      case "bool":
        writeBool(val);
        break;
      case "raw":
        writeRaw(val);
        break;
      case "arr_str":
        writeArray(val, writeString);
        break;
      case "arr_int":
        writeArray(val, writeInt32);
        break;
      case "arr_float":
        writeArray(val, writeFloat);
        break;
      case "arr_bool":
        writeArray(val, writeBool);
        break;
      case "arr_raw":
        writeArray(val, writeRaw);
        break;
      case "null":
        writeNull();
        break;
    }
  }
  const totalLength = bufs.reduce((acc, buf) => acc + buf.byteLength, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of bufs) {
    output.set(buf, offset);
    offset += buf.byteLength;
  }
  return output;
}
var WASM_SOURCE_MAP = {
  "default": "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",
  "compat": "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"
};
var cache = /* @__PURE__ */ new Map();
function loadMap(buildKey) {
  return __async(this, null, function* () {
    if (cache.has(buildKey)) return cache.get(buildKey);
    const b64 = WASM_SOURCE_MAP[buildKey];
    if (!b64) throw new Error(`No source map for build "${buildKey}"`);
    const gzipped = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const ds = new DecompressionStream("gzip");
    const writer = ds.writable.getWriter();
    writer.write(gzipped);
    writer.close();
    const buf = yield new Response(ds.readable).arrayBuffer();
    const dv = new DataView(buf);
    const bytes = new Uint8Array(buf);
    const firstId = dv.getUint32(0, true);
    const funcCount = dv.getUint32(4, true);
    const numNames = dv.getUint32(8, true);
    const td = new TextDecoder();
    const names = [];
    let pos = 12;
    for (let i = 0; i < numNames; i++) {
      const len = bytes[pos++];
      names.push(td.decode(bytes.subarray(pos, pos + len)));
      pos += len;
    }
    const funcNames = [];
    for (let i = 0; i < funcCount; i++) {
      const idx = dv.getUint16(pos, true);
      pos += 2;
      funcNames.push(idx === 65535 ? null : names[idx]);
    }
    const entry = { firstId, funcNames };
    cache.set(buildKey, entry);
    return entry;
  });
}
var Debug = {
  /**
   * Resolves a list of wasm function indices to their cleaned symbol names.
   */
  decodeFuncIds: (funcIds, isCompatBuild) => __async(void 0, null, function* () {
    const buildKey = isCompatBuild ? "compat" : "default";
    const { firstId, funcNames } = yield loadMap(buildKey);
    return funcIds.map((funcId) => {
      const i = funcId - firstId;
      const name = i >= 0 && i < funcNames.length && funcNames[i] ? funcNames[i] : "(unknown)";
      return { funcId, name };
    });
  }),
  /**
   * Annotates a wasm stack trace string with resolved function names.
   *
   * Example input from Chrome:
   *   at http://localhost:8080/esm/wasm/wllama.wasm:wasm-function[775]:0x74251
   *   at async blob:http://localhost:8080/53a863cc-7227-45cc-8594-ddbbf5257f20:317:28
   *
   * Example input from Firefox:
   *   @http://localhost:8080/esm/wasm/wllama.wasm:wasm-function[796]:0x7dfe2
   *       at wModuleInit/WebAssembly.promising/< (9b6a2acd-d909-44e2-b021-d42fb9087cfb:15:32) index.js:1433:45
   *
   * Example input from Safari:
   *   2441@wasm-function[2441]
   *       at wrapper (d746f19e-4523-4f36-ba06-d0969acc0b05:22:126009)
   *
   * Example output:
   *   wasm-func[775] (server_response::send)
   */
  decodeStackTrace: (stack, isCompatBuild) => __async(void 0, null, function* () {
    const re = /wasm-function\[(\d+)\]/g;
    const funcIds = [
      ...new Set([...stack.matchAll(re)].map((m) => parseInt(m[1])))
    ];
    if (funcIds.length === 0) return stack;
    const resolved = yield Debug.decodeFuncIds(funcIds, isCompatBuild);
    return resolved.map((r) => {
      if (r.name === "(unknown)") {
        return `    wasm-func[${r.funcId}] (unknown)`;
      }
      return `    wasm-func[${r.funcId}] (${r.name})`;
    }).join("\n");
  })
};
var textDecoder = new TextDecoder();
var URL_PARTS_REGEX = /-(\d{5})-of-(\d{5})\.gguf(?:\?.*)?$/;
var parseShardNumber = (fnameOrUrl) => {
  const matches = fnameOrUrl.match(URL_PARTS_REGEX);
  if (!matches) {
    return {
      baseURL: fnameOrUrl,
      current: 1,
      total: 1
    };
  } else {
    return {
      baseURL: fnameOrUrl.replace(URL_PARTS_REGEX, ""),
      current: parseInt(matches[1]),
      total: parseInt(matches[2])
    };
  }
};
var sortFileByShard = (blobs) => {
  const isFiles = blobs.every((b) => !!b.name);
  if (isFiles && blobs.length > 1) {
    const files = blobs;
    files.sort((a, b) => {
      const infoA = parseShardNumber(a.name);
      const infoB = parseShardNumber(b.name);
      return infoA.current - infoB.current;
    });
  }
};
var isMmproj = (blob) => __async(void 0, null, function* () {
  const META_NAME = "general.architecture";
  const META_VAL = "clip";
  const tmp = blob.slice(0, 128 * 1024);
  const header = yield tmp.arrayBuffer();
  const buf = new Uint8Array(header);
  const nameBytes = new TextEncoder().encode(META_NAME);
  const valBytes = new TextEncoder().encode(META_VAL);
  let offset = -1;
  outer: for (let i = 0; i <= buf.length - nameBytes.length; i++) {
    for (let j = 0; j < nameBytes.length; j++) {
      if (buf[i + j] !== nameBytes[j]) continue outer;
    }
    offset = i;
    break;
  }
  if (offset === -1) return false;
  if (offset + 8 * 4 + 4 > buf.length) return false;
  const view = new DataView(header);
  const valLen = view.getBigUint64(offset + 8 * 3, true);
  if (valLen !== /* @__PURE__ */ BigInt("4")) return false;
  for (let i = 0; i < valBytes.length; i++) {
    if (buf[offset + 8 * 4 + i] !== valBytes[i]) return false;
  }
  return true;
});
var absoluteUrl = (relativePath) => new URL(relativePath, typeof document !== "undefined" ? document.baseURI : self.location.href).href; /* FAB-02 patch: allow running inside a Worker (was document.baseURI only) */
var padDigits = (number, digits) => {
  return Array(Math.max(digits - String(number).length + 1, 0)).join("0") + number;
};
var sumArr = (arr) => arr.reduce((prev, curr) => prev + curr, 0);
var isString = (value) => !!(value == null ? void 0 : value.startsWith);
var MMPROJ_FILE_NAME = "mmproj.gguf";
var prepareBlobs = (blobsInp) => __async(void 0, null, function* () {
  const blobs = [];
  let blobMmproj = null;
  for (const blob of blobsInp) {
    if (yield isMmproj(blob)) {
      blobMmproj = blob;
    } else {
      blobs.push(blob);
    }
  }
  sortFileByShard(blobs);
  const result = blobs.map((blob, i) => ({
    blob,
    name: `model-${padDigits(i + 1, 5)}-of-${padDigits(blobs.length, 5)}.gguf`
  }));
  if (blobMmproj) {
    result.push({
      blob: blobMmproj,
      name: MMPROJ_FILE_NAME
    });
  }
  return {
    llm: result.filter((f) => f.name !== MMPROJ_FILE_NAME),
    mmproj: blobMmproj ? { blob: blobMmproj, name: MMPROJ_FILE_NAME } : null,
    all: result
  };
});
var isSupportMultiThread = () => ((e) => __async(void 0, null, function* () {
  try {
    return "undefined" != typeof MessageChannel && new MessageChannel().port1.postMessage(new SharedArrayBuffer(1)), WebAssembly.validate(e);
  } catch (e2) {
    return false;
  }
}))(
  new Uint8Array([
    0,
    97,
    115,
    109,
    1,
    0,
    0,
    0,
    1,
    4,
    1,
    96,
    0,
    0,
    3,
    2,
    1,
    0,
    5,
    4,
    1,
    3,
    1,
    1,
    10,
    11,
    1,
    9,
    0,
    65,
    0,
    254,
    16,
    2,
    0,
    26,
    11
  ])
);
var isSupportExceptions = () => __async(void 0, null, function* () {
  return WebAssembly.validate(
    new Uint8Array([
      0,
      97,
      115,
      109,
      1,
      0,
      0,
      0,
      1,
      4,
      1,
      96,
      0,
      0,
      3,
      2,
      1,
      0,
      10,
      8,
      1,
      6,
      0,
      6,
      64,
      25,
      11,
      11
    ])
  );
});
var isSupportSIMD = () => __async(void 0, null, function* () {
  return WebAssembly.validate(
    new Uint8Array([
      0,
      97,
      115,
      109,
      1,
      0,
      0,
      0,
      1,
      5,
      1,
      96,
      0,
      1,
      123,
      3,
      2,
      1,
      0,
      10,
      10,
      1,
      8,
      0,
      65,
      0,
      253,
      15,
      253,
      98,
      11
    ])
  );
});
var isSupportJSPI = () => {
  return !!WebAssembly.Suspending;
};
var isSupportWebGPU = () => {
  return !!navigator.gpu;
};
var isSupportMem64 = () => {
  try {
    new WebAssembly.Memory({
      address: "i64",
      initial: /* @__PURE__ */ BigInt("1")
      // 1 page (64 KiB)
    });
    return true;
  } catch (e) {
    return false;
  }
};
var checkEnvironmentCompatible = () => __async(void 0, null, function* () {
  if (!(yield isSupportExceptions())) {
    throw new Error("WebAssembly runtime does not support exception handling");
  }
  if (!(yield isSupportSIMD())) {
    throw new Error("WebAssembly runtime does not support SIMD");
  }
});
var isFirefox = () => {
  return !!navigator.userAgent.match(/Firefox\/([0-9\.]+)(?:\s|$)/);
};
var GGUF_FILE_REGEX = /^.*\.gguf(?:\?.*)?$/;
var isValidGgufFile = (path) => {
  return GGUF_FILE_REGEX.test(path);
};
var isSafariMobile = () => {
  return !!navigator.userAgent.match(/Version\/([0-9\._]+).*Mobile.*Safari.*/);
};
var createWorker = (workerCode) => {
  const workerURL = URL.createObjectURL(
    isString(workerCode) ? new Blob([workerCode], { type: "text/javascript" }) : workerCode
  );
  return new Worker(workerURL, { type: "module" });
};
var cbToAsyncIter = (fn) => (...args) => {
  let values = [];
  let resolve;
  let reject;
  values.push(
    new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    })
  );
  fn(...args, (val, done, err) => {
    if (err) {
      reject(err);
      return;
    }
    resolve([val, done]);
    values.push(
      new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      })
    );
  });
  return function() {
    return __asyncGenerator(this, null, function* () {
      let val;
      for (let i = 0, done = false; !done; i++) {
        [val, done] = yield new __await(values[i]);
        delete values[i];
        if (val !== void 0) yield val;
      }
    });
  }();
};
var canUseAsyncFileRead = (compat) => isSupportJSPI() || compat;
var needCompat = () => !isSupportJSPI() || !isSupportMem64();
var LIBLLAMA_VERSION = "b9640-dd4623a";
var LLAMA_CPP_WORKER_CODE = "// Start the main llama.cpp\nlet wllamaMalloc;\nlet wllamaStart;\nlet wllamaAction;\nlet wllamaExit;\nlet wllamaDebug;\n\nlet Module = null;\nlet isCompat = false;\nlet lastStack = '';\nlet isAborted = false;\nlet hasMultithread = false;\n\n// ===== construction flight recorder (plan of record 2026-08-25) =====\n// Same-worker synchronous OPFS write-ahead journal: one reused 256-byte\n// record, written and flush()ed BEFORE each dangerous operation begins.\n// Zero strings/JSON/allocation on the checkpoint path.\nconst ST_RECORD_BYTES = 256; const ST_SLOTS = 4096;\nlet __stCrcTable = null;\nfunction __stCrc32(bytes, len) {\n  if (!__stCrcTable) { __stCrcTable = new Uint32Array(256);\n    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; __stCrcTable[n] = c >>> 0; } }\n  let c = 0xFFFFFFFF; for (let i = 0; i < len; i++) c = __stCrcTable[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);\n  return (c ^ 0xFFFFFFFF) >>> 0;\n}\nconst __stState = { sourceReadInFlightBytes: 0, sourceHandleLogicalBytes: 0, sourceTouchedUpperBytes: 0,\n  totalReadBytes: 0, readOrdinal: 0, fileOrdinal: 0, gpuLive2: 0, gpuLive3: 0, gpuLive4: 0,\n  uploadedCumulative: 0, uploadPending: 0, queueEpoch: 0, lastCompletedEpoch: 0, postReady: false, postReadyGpuBufferCount: 0, postReadyGpuBufferBytes: 0, postReadyPipelineCount: 0 };\nclass __StFlight {\n  constructor(handle, seq, runId) { this.h = handle; this.seq = seq; this.runId = runId;\n    this.buf = new ArrayBuffer(ST_RECORD_BYTES); this.u8 = new Uint8Array(this.buf); this.dv = new DataView(this.buf);\n    this.prevFlushUs = 0; this.failed = false; }\n  setU64(off, val) { const v = Math.max(0, Math.floor(val || 0));\n    this.dv.setUint32(off, v % 0x100000000, true); this.dv.setUint32(off + 4, Math.floor(v / 0x100000000), true); }\n  nativeCheckpoint(phase, op, edge, opSerial, tensorId, requested, actual, payload, offs, error, mallocLive, mallocFree, sbrkBytes) {\n    if (this.failed) throw new Error('flight recorder faulted');\n    if (phase === 8 && op === 9 && edge === 2) __stState.postReady = true;\n    if (edge === 2 && op === 4 && actual > 0) {\n      if (tensorId === 3) __stState.gpuLive3 += actual; else if (tensorId === 4) __stState.gpuLive4 += actual; else __stState.gpuLive2 += actual;\n    }\n    if (edge === 2 && op === 7 && actual > 0) { __stState.gpuLive3 = Math.max(__stState.gpuLive3, actual); }\n    if (op === 5 && edge === 1) { __stState.uploadPending = actual; __stState.queueEpoch = opSerial; }\n    if (op === 6 && edge === 2) { __stState.uploadedCumulative = payload; __stState.uploadPending = 0; __stState.lastCompletedEpoch = opSerial; }\n    const t0 = performance.now();\n    this.u8.fill(0); const v = this.dv; const seq = this.seq++;\n    v.setUint32(0, 0x53504652, true); v.setUint16(4, 1, true); v.setUint16(6, ST_RECORD_BYTES, true);\n    this.setU64(8, seq); this.u8.set(this.runId, 16);\n    this.setU64(32, Math.round(t0 * 1000)); this.setU64(40, Date.now());\n    v.setUint16(48, phase, true); v.setUint16(50, op, true); v.setUint8(52, edge); v.setUint8(53, 1); v.setUint8(54, 1); v.setUint8(55, 7);\n    v.setUint32(56, opSerial >>> 0, true); v.setUint32(60, __stState.readOrdinal >>> 0, true);\n    v.setUint32(64, __stState.fileOrdinal >>> 0, true); v.setUint32(68, tensorId >>> 0, true);\n    const wasmCap = (typeof Module !== 'undefined' && Module && Module.wasmMemory && Module.wasmMemory.buffer) ? Module.wasmMemory.buffer.byteLength : 0;\n    this.setU64(72, wasmCap); this.setU64(80, sbrkBytes); this.setU64(88, mallocLive); this.setU64(96, mallocFree);\n    this.setU64(104, __stState.sourceHandleLogicalBytes); this.setU64(112, __stState.sourceTouchedUpperBytes);\n    this.setU64(120, __stState.sourceReadInFlightBytes); this.setU64(128, 0);\n    this.setU64(136, __stState.gpuLive2); this.setU64(144, __stState.gpuLive3); this.setU64(152, __stState.gpuLive4);\n    this.setU64(160, __stState.uploadedCumulative); this.setU64(168, __stState.uploadPending);\n    this.setU64(176, requested); this.setU64(184, actual); this.setU64(192, payload); this.setU64(200, offs);\n    v.setUint32(208, __stState.queueEpoch >>> 0, true); v.setUint32(212, __stState.lastCompletedEpoch >>> 0, true);\n    v.setUint32(216, this.prevFlushUs >>> 0, true); v.setUint32(220, error >>> 0, true);\n    v.setUint32(252, __stCrc32(this.u8, 252), true);\n    const at = (seq % ST_SLOTS) * ST_RECORD_BYTES;\n    let written = 0;\n    while (written < ST_RECORD_BYTES) {\n      const n = this.h.write(this.u8.subarray(written), { at: at + written });\n      if (!(n > 0)) { this.failed = true; throw new Error('flight short write'); }\n      written += n;\n    }\n    this.h.flush();\n    this.prevFlushUs = Math.round((performance.now() - t0) * 1000);\n  }\n}\nasync function __stOpenFlight(runIdBytes) {\n  const root = await navigator.storage.getDirectory();\n  const dir = await root.getDirectoryHandle('speechtest-flight', { create: true });\n  const fh = await dir.getFileHandle('construction-flight-v1.bin', { create: true });\n  const h = await fh.createSyncAccessHandle();\n  const RING = ST_RECORD_BYTES * ST_SLOTS;\n  if (h.getSize() !== RING) { h.truncate(RING); h.flush(); }\n  const tmp = new Uint8Array(ST_RECORD_BYTES); const dv = new DataView(tmp.buffer);\n  let maxSeq = -1;\n  for (let i = 0; i < ST_SLOTS; i++) {\n    const n = h.read(tmp, { at: i * ST_RECORD_BYTES }); if (n < ST_RECORD_BYTES) continue;\n    if (dv.getUint32(0, true) !== 0x53504652) continue;\n    if (dv.getUint16(4, true) !== 1) continue;\n    if (dv.getUint32(252, true) !== __stCrc32(tmp, 252)) continue;\n    const seq = dv.getUint32(12, true) * 0x100000000 + dv.getUint32(8, true);\n    if (seq > maxSeq) maxSeq = seq;\n  }\n  return new __StFlight(h, maxSeq + 1, runIdBytes);\n}\nself.__flight_wrapGrow = function (orig, requestedSize) {\n  const f = self.__flight;\n  if (!f) return orig(requestedSize);\n  const oldB = (typeof Module !== 'undefined' && Module && Module.wasmMemory && Module.wasmMemory.buffer) ? Module.wasmMemory.buffer.byteLength : 0;\n  f.nativeCheckpoint(2, 3, 1, 0, 0, Math.max(0, requestedSize - oldB), 0, requestedSize, 0, 0, 0, 0, 0);\n  const r = orig(requestedSize);\n  const newB = (typeof Module !== 'undefined' && Module && Module.wasmMemory && Module.wasmMemory.buffer) ? Module.wasmMemory.buffer.byteLength : 0;\n  f.nativeCheckpoint(2, 3, r ? 2 : 3, 0, 0, Math.max(0, requestedSize - oldB), Math.max(0, newB - oldB), newB, 0, r ? 0 : 1, 0, 0, 0);\n  return r;\n};\nself.__flightGpuBufferCreated = function (bytes) { if (__stState.postReady) { __stState.postReadyGpuBufferCount += 1; __stState.postReadyGpuBufferBytes += Number(bytes) || 0; } };\nself.__flightGpuPipelineCreated = function () { if (__stState.postReady) __stState.postReadyPipelineCount += 1; };\n// ===== end flight recorder =====\n\n//////////////////////////////////////////////////////////////\n// UTILS\n//////////////////////////////////////////////////////////////\n\n// send message back to main thread\nconst msg = (data, transfer) => postMessage(data, transfer);\n\n// Convert CPP log into JS log\nconst cppLogToJSLog = (line) => {\n  const matched = line.match(/@@(DEBUG|INFO|WARN|ERROR)@@(.*)/);\n  return !!matched\n    ? {\n        level: (matched[1] === 'INFO' ? 'debug' : matched[1]).toLowerCase(),\n        text: matched[2],\n      }\n    : { level: 'log', text: line };\n};\n\nconst getHeapU8 = () => {\n  const buffer = Module.wasmMemory.buffer;\n  return new Uint8Array(buffer);\n};\n\nconst toSizeT = (num) => {\n  return isCompat ? Number(num) : BigInt(num);\n};\n\n// Get module config that forwards stdout/err to main thread\nconst getWModuleConfig = (_argMainScriptBlob) => {\n  var pathConfig = RUN_OPTIONS.pathConfig;\n  var pthreadPoolSize = RUN_OPTIONS.nbThread;\n  var argMainScriptBlob = _argMainScriptBlob;\n\n  isCompat = RUN_OPTIONS.compat;\n  hasMultithread = pthreadPoolSize > 1;\n\n  msg({\n    verb: 'console.debug',\n    args: [\n      `Multithread enabled: ${hasMultithread}, pthreadPoolSize: ${pthreadPoolSize}`,\n    ],\n  });\n\n  if (!pathConfig['wllama.wasm']) {\n    throw new Error('\"wllama.wasm\" is missing in pathConfig');\n  }\n  return {\n    noInitialRun: true,\n    print: function (text) {\n      if (arguments.length > 1)\n        text = Array.prototype.slice.call(arguments).join(' ');\n      msg({ verb: 'console.log', args: [text] });\n    },\n    printErr: function (text) {\n      if (arguments.length > 1)\n        text = Array.prototype.slice.call(arguments).join(' ');\n      if (text.startsWith('@@STACK@@')) {\n        lastStack = text.slice('@@STACK@@'.length);\n        return;\n      }\n      if (text.startsWith('@@LEDGER@@')) {\n        msg({ verb: 'ledger', args: [text.slice(10)] });\n        return;\n      }\n      const logLine = cppLogToJSLog(text);\n      msg({ verb: 'console.' + logLine.level, args: [logLine.text] });\n    },\n    locateFile: function (filename, basePath) {\n      const p = pathConfig[filename];\n      const truncate = (str) =>\n        str.length > 128 ? `${str.substr(0, 128)}...` : str;\n      if (filename.match(/wllama\\.worker\\.js/)) {\n        msg({\n          verb: 'console.error',\n          args: [\n            '\"wllama.worker.js\" is removed from v2.2.1. Hint: make sure to clear browser\\'s cache.',\n          ],\n        });\n      } else {\n        msg({\n          verb: 'console.debug',\n          args: [`Loading \"${filename}\" from \"${truncate(p)}\"`],\n        });\n        return p;\n      }\n    },\n    mainScriptUrlOrBlob: hasMultithread\n      ? argMainScriptBlob\n      : 'throw new Error(\"Multithreading is not enabled\")',\n    pthreadPoolSize: hasMultithread ? pthreadPoolSize : 0,\n    wasmMemory: hasMultithread ? getWasmMemory() : null,\n    onAbort: function (message) {\n      isAborted = true;\n      msg({ verb: 'signal.abort', args: ['abort', message, lastStack, null] });\n    },\n    onExit: function (code) {\n      isAborted = true;\n      const callstack = new Error().stack.toString();\n      msg({\n        verb: 'signal.abort',\n        args: ['abort', 'exit(' + code + ')', callstack, null],\n      });\n    },\n  };\n};\n\n// Get the memory to be used by wasm. (Only used in multi-thread mode)\n// Because we have a weird OOM issue on iOS, we need to try some values\n// See: https://github.com/emscripten-core/emscripten/issues/19144\n//      https://github.com/godotengine/godot/issues/70621\nconst getWasmMemory = () => {\n  let minBytes = 128 * 1024 * 1024;\n  let maxBytes = 4096 * 1024 * 1024;\n  let stepBytes = 128 * 1024 * 1024;\n  while (maxBytes > minBytes) {\n    try {\n      const wasmMemory = new WebAssembly.Memory({\n        initial: toSizeT(minBytes / 65536),\n        maximum: toSizeT(maxBytes / 65536),\n        shared: true,\n        address: isCompat ? undefined : 'i64',\n      });\n      return wasmMemory;\n    } catch (e) {\n      maxBytes -= stepBytes;\n      continue; // retry\n    }\n  }\n  throw new Error('Cannot allocate WebAssembly.Memory');\n};\n\n//////////////////////////////////////////////////////////////\n// HEAPFS PATCH\n//////////////////////////////////////////////////////////////\n\n/**\n * By default, emscripten uses memfs. The way it works is by\n * allocating new Uint8Array in javascript heap. This is not good\n * because it requires files to be copied to wasm heap each time\n * a file is read.\n *\n * HeapFS is an alternative, which resolves this problem by\n * allocating space for file directly inside wasm heap. This\n * allows us to mmap without doing any copy.\n *\n * For llama.cpp, this is great because we use MAP_SHARED\n *\n * Ref: https://github.com/ngxson/wllama/pull/39\n * Ref: https://github.com/emscripten-core/emscripten/blob/main/src/library_memfs.js\n *\n * Note 29/05/2024 @ngxson\n * Due to ftell() being limited to MAX_LONG, we cannot load files bigger than 2^31 bytes (or 2GB)\n * Ref: https://github.com/emscripten-core/emscripten/blob/main/system/lib/libc/musl/src/stdio/ftell.c\n */\n\nconst fsNameToFile = {}; // map Name => File\nconst fsIdToFile = {}; // map ID => File\nlet currFileId = 0;\n\n// Patch and redirect memfs calls to wllama\nconst patchHeapFS = () => {\n  const m = Module;\n  // save functions\n  m.MEMFS.stream_ops._read = m.MEMFS.stream_ops.read;\n  m.MEMFS.stream_ops._write = m.MEMFS.stream_ops.write;\n  m.MEMFS.stream_ops._llseek = m.MEMFS.stream_ops.llseek;\n  m.MEMFS.stream_ops._allocate = m.MEMFS.stream_ops.allocate;\n  m.MEMFS.stream_ops._mmap = m.MEMFS.stream_ops.mmap;\n  m.MEMFS.stream_ops._msync = m.MEMFS.stream_ops.msync;\n\n  const patchStream = (stream) => {\n    const name = stream.node.name;\n    if (fsNameToFile[name]) {\n      const f = fsNameToFile[name];\n      const ptr = Number(f.ptr);\n      stream.node.contents = getHeapU8().subarray(ptr, ptr + f.size);\n      stream.node.usedBytes = f.size;\n    }\n  };\n\n  // replace \"read\" functions\n  m.MEMFS.stream_ops.read = function (\n    stream,\n    buffer,\n    offset,\n    length,\n    position\n  ) {\n    patchStream(stream);\n    return m.MEMFS.stream_ops._read(stream, buffer, offset, length, position);\n  };\n  m.MEMFS.ops_table.file.stream.read = m.MEMFS.stream_ops.read;\n\n  // replace \"llseek\" functions\n  m.MEMFS.stream_ops.llseek = function (stream, offset, whence) {\n    patchStream(stream);\n    return m.MEMFS.stream_ops._llseek(stream, offset, whence);\n  };\n  m.MEMFS.ops_table.file.stream.llseek = m.MEMFS.stream_ops.llseek;\n\n  // replace \"mmap\" functions\n  m.MEMFS.stream_ops.mmap = function (stream, length, position, prot, flags) {\n    patchStream(stream);\n    const name = stream.node.name;\n    if (fsNameToFile[name]) {\n      const f = fsNameToFile[name];\n      const mmapPtr = f.ptr + toSizeT(position);\n      return {\n        ptr: mmapPtr,\n        allocated: false,\n      };\n    } else {\n      return m.MEMFS.stream_ops._mmap(stream, length, position, prot, flags);\n    }\n  };\n  m.MEMFS.ops_table.file.stream.mmap = m.MEMFS.stream_ops.mmap;\n\n  // mount FS\n  m.FS.mkdir('/models');\n  m.FS.mount(m.MEMFS, { root: '.' }, '/models');\n};\n\n// Allocate a new file in wllama heapfs, returns file ID\nconst heapfsAlloc = (name, size, allocBuffer) => {\n  if (size < 1) {\n    throw new Error('File size must be bigger than 0');\n  }\n  const m = Module;\n  const ptr = toSizeT(allocBuffer ? m.mmapAlloc(size) : 0);\n  const file = {\n    ptr: ptr,\n    size: size,\n    id: currFileId++,\n  };\n  fsIdToFile[file.id] = file;\n  fsNameToFile[name] = file;\n  return file.id;\n};\n\n// Add new file to wllama heapfs, return number of written bytes\nconst heapfsWrite = (id, buffer, offset) => {\n  if (fsIdToFile[id]) {\n    const { ptr, size } = fsIdToFile[id];\n    const afterWriteByte = offset + buffer.byteLength;\n    if (afterWriteByte > size) {\n      throw new Error(\n        `File ID ${id} write out of bound, afterWriteByte = ${afterWriteByte} while size = ${size}`\n      );\n    }\n    getHeapU8().set(buffer, Number(ptr) + offset);\n    return buffer.byteLength;\n  } else {\n    throw new Error(`File ID ${id} not found in heapfs`);\n  }\n};\n\n//////////////////////////////////////////////////////////////\n// ASYNC FILE READ\n//////////////////////////////////////////////////////////////\n\nlet isAwaitReading = false;\nlet pendingReadPromise = null;\nlet pendingReadResolve = null;\nlet pendingReadReject = null;\n\nconst _stripModelsPrefix = (path) => path.replace(/^\\/?models\\//, '');\n\n// Called from EM_ASYNC_JS stub in wllama-fs.h (path is already a JS string)\nconst _wllama_js_file_read = async (path, offset, req_size, out_ptr) => {\n  const name = _stripModelsPrefix(path);\n\n  pendingReadPromise = new Promise((res, rej) => {\n    pendingReadResolve = res;\n    pendingReadReject = rej;\n  });\n  isAwaitReading = true;\n\n  __stState.sourceReadInFlightBytes = req_size;\n  __stState.readOrdinal += 1;\n  postMessage({ verb: 'fs.read_req', args: [name, offset, req_size] });\n\n  let data;\n  try {\n    data = await pendingReadPromise;\n  } finally {\n    isAwaitReading = false;\n    pendingReadResolve = null;\n    pendingReadReject = null;\n  }\n\n  const bytes = new Uint8Array(data);\n  getHeapU8().set(bytes, out_ptr);\n  __stState.sourceReadInFlightBytes = 0;\n  __stState.totalReadBytes += bytes.length;\n  return toSizeT(bytes.length);\n};\n\n//////////////////////////////////////////////////////////////\n// MAIN CODE\n//////////////////////////////////////////////////////////////\n\nconst callWrapper = (name, ret, args, isAsync) => {\n  const fn = Module.cwrap(\n    name,\n    ret,\n    args,\n    isAsync ? { async: true } : undefined\n  );\n  return async (action, req) => {\n    // console.log(`Calling ${name} with action:`, action, 'and req:', req);\n    let result;\n    try {\n      if (args.length === 2) {\n        result = isAsync ? await fn(action, req) : fn(action, req);\n      } else {\n        result = fn();\n      }\n    } catch (ex) {\n      console.error(ex);\n      throw ex;\n    }\n    return result;\n  };\n};\n\nfunction handleError(err) {\n  // If WASM already aborted, onAbort already sent signal.abort; skip to avoid\n  // re-reporting the resulting WebAssembly.RuntimeError as a JS exception.\n  if (isAborted) return;\n\n  const message = err ? err.message || String(err) : 'Unknown error';\n  const stack = err ? err.stack || String(err) : '';\n  msg({\n    verb: 'signal.abort',\n    args: ['exception', message, stack, err],\n  });\n}\n\nonmessage = async (e) => {\n  if (!e.data) return;\n  const { verb, args, callbackId } = e.data;\n\n  // fs.read_res arrives while wasm is JSPI-suspended; resolve the pending promise.\n  if (verb === 'fs.read_res') {\n    if (args[1]) {\n      __stState.sourceHandleLogicalBytes = args[1].openLogicalBytes || 0;\n      __stState.sourceTouchedUpperBytes = args[1].touchedUpperBytes || 0;\n      __stState.fileOrdinal = args[1].fileOrdinal || 0;\n    }\n    if (pendingReadResolve) {\n      pendingReadResolve(args[0]);\n    }\n    return;\n  }\n\n  // Guard: while awaiting a file read, reject any other incoming task.\n  if (isAwaitReading) {\n    if (callbackId) {\n      msg({\n        callbackId,\n        err: 'Worker is suspended waiting for file data (JSPI)',\n      });\n    }\n    return;\n  }\n\n  if (!callbackId) {\n    msg({ verb: 'console.error', args: ['callbackId is required', e.data] });\n    return;\n  }\n\n  if (verb === 'module.init') {\n    const argMainScriptBlob = args[0];\n    const argUseAsyncFile = args[1];\n    const argOffloadTiedEmbd = args[2];\n    const argFlight = args[3];\n    const argRunId = args[4];\n    const argUploadIntervalMiB = args[5];\n    const argBallastMiB = args[6];\n    const argInitialMemoryMiB = args[7];\n    const argMarginCanaryMiB = args[8];\n    msg({ verb: 'console.log', args: ['tied_offload_arg=' + String(!!argOffloadTiedEmbd)] });\n    try {\n      Module = getWModuleConfig(argMainScriptBlob);\n      Module.preRun = () => {\n        if (argUseAsyncFile) {\n          Module.ENV['USE_ASYNC_FILE'] = '1';\n        }\n        if (argOffloadTiedEmbd) {\n          Module.ENV['WLLAMA_OFFLOAD_TIED_EMBD'] = '1';\n        }\n        if (argUploadIntervalMiB) {\n          Module.ENV['WLLAMA_UPLOAD_INTERVAL_MIB'] = String(argUploadIntervalMiB);\n        }\n        if (argMarginCanaryMiB) {\n          Module.ENV['WLLAMA_MARGIN_CANARY_MIB'] = String(argMarginCanaryMiB);\n        }\n        if (argBallastMiB) {\n          Module.ENV['WLLAMA_BALLAST_MIB'] = String(argBallastMiB);\n        }\n      };\n      Module.onRuntimeInitialized = () => {\n        // async call once module is ready\n        // init FS\n        patchHeapFS();\n        // init cwrap\n        const pointer = isCompat ? 'number' : 'bigint';\n        // TODO: note sure why emscripten cannot bind if there is only 1 argument\n        wllamaMalloc = callWrapper('wllama_malloc', pointer, [\n          'number',\n          pointer,\n        ]);\n        wllamaStart = callWrapper('wllama_start', 'string', [], true);\n        wllamaAction = callWrapper(\n          'wllama_action',\n          pointer,\n          ['string', pointer],\n          true\n        );\n        wllamaExit = callWrapper('wllama_exit', 'string', []);\n        wllamaDebug = callWrapper('wllama_debug', 'string', []);\n        msg({ callbackId, result: null });\n      };\n      if (argFlight) {\n        // Arm the recorder BEFORE module init so no dangerous boundary can\n        // precede a durable RECORDER_ARMED record. A recorder fault here\n        // aborts the run: an unmeasured attempt defeats the experiment.\n        self.__flight = await __stOpenFlight(argRunId && argRunId.length === 16 ? new Uint8Array(argRunId) : new Uint8Array(16));\n        self.__flight.nativeCheckpoint(1, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);\n      }\n      if (argInitialMemoryMiB) {\n        // Model-frontier instruction 2: pre-size the Wasm heap instead of\n        // growing into it mid-construction. Same binary; policy only.\n        Module.INITIAL_MEMORY = argInitialMemoryMiB * 1024 * 1024;\n      }\n      if (self.__flight) self.__flight.nativeCheckpoint(2, 10, 1, 0, 0, (argInitialMemoryMiB || 0) * 1048576, 0, 0, 0, 0, 0, 0, 0);\n      const __stPrevORI = Module.onRuntimeInitialized;\n      Module.onRuntimeInitialized = () => {\n        if (self.__flight) {\n          const cap = Module.wasmMemory && Module.wasmMemory.buffer ? Module.wasmMemory.buffer.byteLength : 0;\n          self.__flight.nativeCheckpoint(2, 11, 2, 0, 0, (argInitialMemoryMiB || 0) * 1048576, cap, cap, 0, 0, 0, 0, 0);\n        }\n        __stPrevORI();\n      };\n      wModuleInit();\n    } catch (err) {\n      handleError(err);\n    }\n    return;\n  }\n\n  if (verb === 'fs.alloc') {\n    const argFilename = args[0];\n    const argSize = args[1];\n    const argAllocBuffer = args[2];\n    try {\n      // create blank file\n      const emptyBuffer = new ArrayBuffer(0);\n      Module['FS_createDataFile'](\n        '/models',\n        argFilename,\n        emptyBuffer,\n        true,\n        true,\n        true\n      );\n      // alloc data on heap\n      const fileId = heapfsAlloc(argFilename, argSize, argAllocBuffer);\n      msg({ callbackId, result: { fileId } });\n    } catch (err) {\n      handleError(err);\n    }\n    return;\n  }\n\n  if (verb === 'fs.write') {\n    const argFileId = args[0];\n    const argBuffer = args[1];\n    const argOffset = args[2];\n    try {\n      const writtenBytes = heapfsWrite(argFileId, argBuffer, argOffset);\n      msg({ callbackId, result: { writtenBytes } });\n    } catch (err) {\n      handleError(err);\n    }\n    return;\n  }\n\n  if (verb === 'wllama.start') {\n    try {\n      const result = await wllamaStart();\n      msg({ callbackId, result });\n    } catch (err) {\n      handleError(err);\n    }\n    return;\n  }\n\n  if (verb === 'wllama.action') {\n    const argAction = args[0];\n    const argEncodedMsg = args[1];\n    try {\n      const inputPtr = await wllamaMalloc(toSizeT(argEncodedMsg.byteLength), 0);\n      // copy data to wasm heap\n      const inputBuffer = new Uint8Array(\n        getHeapU8().buffer,\n        Number(inputPtr),\n        argEncodedMsg.byteLength\n      );\n      inputBuffer.set(argEncodedMsg, 0);\n      const outputPtr = await wllamaAction(argAction, inputPtr);\n      // length of output buffer is written at the first 4 bytes of input buffer\n      const outputLen = new Uint32Array(\n        getHeapU8().buffer,\n        Number(inputPtr),\n        1\n      )[0];\n      // copy the output buffer to JS heap\n      const outputBuffer = new Uint8Array(outputLen);\n      const outputSrcView = new Uint8Array(\n        getHeapU8().buffer,\n        Number(outputPtr),\n        outputLen\n      );\n      outputBuffer.set(outputSrcView, 0); // copy it\n      msg({ callbackId, result: outputBuffer }, [outputBuffer.buffer]);\n    } catch (err) {\n      handleError(err);\n    }\n    return;\n  }\n\n  if (verb === 'wllama.exit') {\n    try {\n      const result = await wllamaExit();\n      msg({ callbackId, result });\n    } catch (err) {\n      handleError(err);\n    }\n    return;\n  }\n\n  if (verb === 'flight.mark') {\n    // Durable proof fence: the page awaits this round trip, and the write\n    // + flush completes before we reply - so the mark is durable before\n    // the fenced operation begins (frontier directive).\n    try {\n      if (self.__flight) self.__flight.nativeCheckpoint(args[0] | 0, args[1] | 0, args[2] | 0, 0, 0, args[3] || 0, __stState.postReadyGpuBufferBytes, __stState.postReadyGpuBufferCount, __stState.postReadyPipelineCount, args[4] || 0, 0, 0, 0);\n      msg({ callbackId, result: true });\n    } catch (err) { handleError(err); }\n    return;\n  }\n\n  if (verb === 'wllama.debug') {\n    try {\n      const result = await wllamaDebug();\n      msg({ callbackId, result });\n    } catch (err) {\n      handleError(err);\n    }\n    return;\n  }\n\n  if (verb === 'wllama.memory') {\n    try {\n      // Capacity is a Wasm linear-memory high-water proxy. It is deliberately\n      // not reported as allocator-live or physical process residency.\n      const wasmCapacityBytes = Module?.wasmMemory?.buffer?.byteLength ?? null;\n      msg({ callbackId, result: { wasmCapacityBytes } });\n    } catch (err) {\n      handleError(err);\n    }\n    return;\n  }\n};\n";
var OPFS_UTILS_WORKER_CODE = "let accessHandle;\nlet abortController = new AbortController();\n\nasync function openFile(filename) {\n  const opfsRoot = await navigator.storage.getDirectory();\n  const cacheDir = await opfsRoot.getDirectoryHandle('cache', { create: true });\n  const fileHandler = await cacheDir.getFileHandle(filename, { create: true });\n  accessHandle = await fileHandler.createSyncAccessHandle();\n  accessHandle.truncate(0); // clear file content\n}\n\nasync function writeFile(buf) {\n  accessHandle.write(buf);\n}\n\nasync function closeFile() {\n  accessHandle.flush();\n  accessHandle.close();\n}\n\nasync function writeTextFile(filename, str) {\n  await openFile(filename);\n  await writeFile(new TextEncoder().encode(str));\n  await closeFile();\n}\n\nconst throttled = (func, delay) => {\n  let lastRun = 0;\n  return (...args) => {\n    const now = Date.now();\n    if (now - lastRun > delay) {\n      lastRun = now;\n      func.apply(null, args);\n    }\n  };\n};\n\nconst assertNonNull = (val) => {\n  if (val === null || val === undefined) {\n    throw new Error('OPFS Worker: Assertion failed');\n  }\n};\n\n// respond to main thread\nconst resOK = () => postMessage({ ok: true });\nconst resProgress = (loaded, total) =>\n  postMessage({ progress: { loaded, total } });\nconst resErr = (err) => postMessage({ err });\n\nonmessage = async (e) => {\n  try {\n    if (!e.data) return;\n\n    /**\n     * @param {Object} e.data\n     *\n     * Fine-control FS actions:\n     * - { action: 'open', filename: 'string' }\n     * - { action: 'write', buf: ArrayBuffer }\n     * - { action: 'close' }\n     *\n     * Simple write API:\n     * - { action: 'write-simple', filename: 'string', buf: ArrayBuffer }\n     *\n     * Download API:\n     * - { action: 'download', url: 'string', filename: 'string', options: Object, metadataFileName: 'string' }\n     * - { action: 'download-abort' }\n     */\n    const {\n      action,\n      filename,\n      buf,\n      url,\n      options,\n      metadataFileName,\n      metadataAdditional,\n    } = e.data;\n\n    if (action === 'open') {\n      assertNonNull(filename);\n      await openFile(filename);\n      return resOK();\n    } else if (action === 'write') {\n      assertNonNull(buf);\n      await writeFile(buf);\n      return resOK();\n    } else if (action === 'close') {\n      await closeFile();\n      return resOK();\n    } else if (action === 'write-simple') {\n      assertNonNull(filename);\n      assertNonNull(buf);\n      await openFile(filename);\n      await writeFile(buf);\n      await closeFile();\n      return resOK();\n    } else if (action === 'download') {\n      assertNonNull(url);\n      assertNonNull(filename);\n      assertNonNull(metadataFileName);\n      assertNonNull(options);\n      assertNonNull(options.aborted);\n      abortController = new AbortController();\n      if (options.aborted) abortController.abort();\n      const response = await fetch(url, {\n        ...options,\n        signal: abortController.signal,\n      });\n      const contentLength = response.headers.get('content-length');\n      const etag = (response.headers.get('etag') || '').replace(\n        /[^A-Za-z0-9]/g,\n        ''\n      );\n      const total = parseInt(contentLength, 10);\n      const reader = response.body.getReader();\n      await openFile(filename);\n      let loaded = 0;\n      const throttledProgress = throttled(resProgress, 100);\n      while (true) {\n        const { done, value } = await reader.read();\n        if (done) break;\n        loaded += value.byteLength;\n        await writeFile(value);\n        throttledProgress(loaded, total);\n      }\n      resProgress(total, total); // 100% done\n      await closeFile();\n      // make sure this is in-sync with CacheEntryMetadata\n      await writeTextFile(\n        metadataFileName,\n        JSON.stringify({\n          originalURL: url,\n          originalSize: total,\n          etag,\n          ...metadataAdditional,\n        })\n      );\n      return resOK();\n    } else if (action === 'download-abort') {\n      if (abortController) {\n        abortController.abort();\n      }\n      return;\n    }\n\n    throw new Error('OPFS Worker: Invalid action', e.data);\n  } catch (err) {\n    return resErr(err);\n  }\n};\n";
var WLLAMA_EMSCRIPTEN_CODE = "var Module=typeof Module!=\"undefined\"?Module:{};var ENVIRONMENT_IS_WEB=!!globalThis.window;var ENVIRONMENT_IS_WORKER=!!globalThis.WorkerGlobalScope;var ENVIRONMENT_IS_NODE=globalThis.process?.versions?.node&&globalThis.process?.type!=\"renderer\";var ENVIRONMENT_IS_PTHREAD=ENVIRONMENT_IS_WORKER&&self.name?.startsWith(\"em-pthread\");if(ENVIRONMENT_IS_NODE){var worker_threads=require(\"worker_threads\");global.Worker=worker_threads.Worker;ENVIRONMENT_IS_WORKER=!worker_threads.isMainThread;ENVIRONMENT_IS_PTHREAD=ENVIRONMENT_IS_WORKER&&worker_threads[\"workerData\"]==\"em-pthread\"}var arguments_=[];var thisProgram=\"./this.program\";var quit_=(status,toThrow)=>{throw toThrow};var _scriptName=globalThis.document?.currentScript?.src;if(typeof __filename!=\"undefined\"){_scriptName=__filename}else if(ENVIRONMENT_IS_WORKER){_scriptName=self.location.href}var scriptDirectory=\"\";function locateFile(path){if(Module[\"locateFile\"]){return Module[\"locateFile\"](path,scriptDirectory)}return scriptDirectory+path}var readAsync,readBinary;if(ENVIRONMENT_IS_NODE){var fs=require(\"fs\");scriptDirectory=__dirname+\"/\";readBinary=filename=>{filename=isFileURI(filename)?new URL(filename):filename;var ret=fs.readFileSync(filename);return ret};readAsync=async(filename,binary=true)=>{filename=isFileURI(filename)?new URL(filename):filename;var ret=fs.readFileSync(filename,binary?undefined:\"utf8\");return ret};if(process.argv.length>1){thisProgram=process.argv[1].replace(/\\\\/g,\"/\")}arguments_=process.argv.slice(2);if(typeof module!=\"undefined\"){module[\"exports\"]=Module}quit_=(status,toThrow)=>{process.exitCode=status;throw toThrow}}else if(ENVIRONMENT_IS_WEB||ENVIRONMENT_IS_WORKER){try{scriptDirectory=new URL(\".\",_scriptName).href}catch{}if(!ENVIRONMENT_IS_NODE){if(ENVIRONMENT_IS_WORKER){readBinary=url=>{var xhr=new XMLHttpRequest;xhr.open(\"GET\",url,false);xhr.responseType=\"arraybuffer\";xhr.send(null);return new Uint8Array(xhr.response)}}readAsync=async url=>{if(isFileURI(url)){return new Promise((resolve,reject)=>{var xhr=new XMLHttpRequest;xhr.open(\"GET\",url,true);xhr.responseType=\"arraybuffer\";xhr.onload=()=>{if(xhr.status==200||xhr.status==0&&xhr.response){resolve(xhr.response);return}reject(xhr.status)};xhr.onerror=reject;xhr.send(null)})}var response=await fetch(url,{credentials:\"same-origin\"});if(response.ok){return response.arrayBuffer()}throw new Error(response.status+\" : \"+response.url)}}}else{}var defaultPrint=console.log.bind(console);var defaultPrintErr=console.error.bind(console);if(ENVIRONMENT_IS_NODE){var utils=require(\"util\");var stringify=a=>typeof a==\"object\"?utils.inspect(a):a;defaultPrint=(...args)=>fs.writeSync(1,args.map(stringify).join(\" \")+\"\\n\");defaultPrintErr=(...args)=>fs.writeSync(2,args.map(stringify).join(\" \")+\"\\n\")}var out=defaultPrint;var err=defaultPrintErr;var wasmBinary;var wasmModule;var ABORT=false;var EXITSTATUS;function assert(condition,text){if(!condition){abort(text)}}var isFileURI=filename=>filename.startsWith(\"file://\");function growMemViews(){if(wasmMemory.buffer!=HEAP8.buffer){updateMemoryViews()}}if(ENVIRONMENT_IS_NODE&&ENVIRONMENT_IS_PTHREAD){var parentPort=worker_threads[\"parentPort\"];parentPort.on(\"message\",msg=>global.onmessage?.({data:msg}));Object.assign(globalThis,{self:global,postMessage:msg=>parentPort[\"postMessage\"](msg)});process.on(\"uncaughtException\",err=>{postMessage({cmd:\"uncaughtException\",error:err});process.exit(1)})}var startWorker;if(ENVIRONMENT_IS_PTHREAD){var initializedJS=false;self.onunhandledrejection=e=>{throw e.reason||e};async function handleMessage(e){try{var msgData=e[\"data\"];var cmd=msgData.cmd;if(cmd===\"load\"){let messageQueue=[];self.onmessage=e=>messageQueue.push(e);startWorker=()=>{postMessage({cmd:\"loaded\"});for(let msg of messageQueue){handleMessage(msg)}self.onmessage=handleMessage};for(const handler of msgData.handlers){if(!Module[handler]||Module[handler].proxy){Module[handler]=(...args)=>{postMessage({cmd:\"callHandler\",handler,args})};if(handler==\"print\")out=Module[handler];if(handler==\"printErr\")err=Module[handler]}}wasmMemory=msgData.wasmMemory;updateMemoryViews();wasmModule=msgData.wasmModule;createWasm();run()}else if(cmd===\"run\"){establishStackSpace(msgData.pthread_ptr);__emscripten_thread_init(msgData.pthread_ptr,0,0,1,0,0);PThread.threadInitTLS();__emscripten_thread_mailbox_await(msgData.pthread_ptr);if(!initializedJS){initializedJS=true}try{await invokeEntryPoint(msgData.start_routine,msgData.arg)}catch(ex){if(ex!=\"unwind\"){throw ex}}}else if(msgData.target===\"setimmediate\"){}else if(cmd===\"checkMailbox\"){if(initializedJS){checkMailbox()}}else if(cmd){err(`worker: received unknown command ${cmd}`);err(msgData)}}catch(ex){__emscripten_thread_crashed();throw ex}}self.onmessage=handleMessage}var HEAP8,HEAPU8,HEAP16,HEAPU16,HEAP32,HEAPU32,HEAPF32,HEAPF64;var HEAP64,HEAPU64;var runtimeInitialized=false;function updateMemoryViews(){var b=wasmMemory.buffer;HEAP8=new Int8Array(b);HEAP16=new Int16Array(b);Module[\"HEAPU8\"]=HEAPU8=new Uint8Array(b);HEAPU16=new Uint16Array(b);HEAP32=new Int32Array(b);HEAPU32=new Uint32Array(b);HEAPF32=new Float32Array(b);HEAPF64=new Float64Array(b);HEAP64=new BigInt64Array(b);HEAPU64=new BigUint64Array(b)}function initMemory(){if(ENVIRONMENT_IS_PTHREAD){return}if(Module[\"wasmMemory\"]){wasmMemory=Module[\"wasmMemory\"]}else{var INITIAL_MEMORY=Module[\"INITIAL_MEMORY\"]||100663296;wasmMemory=new WebAssembly.Memory({initial:BigInt(INITIAL_MEMORY/65536),maximum:65536n,shared:true,address:\"i64\"})}updateMemoryViews()}function preRun(){if(Module[\"preRun\"]){if(typeof Module[\"preRun\"]==\"function\")Module[\"preRun\"]=[Module[\"preRun\"]];while(Module[\"preRun\"].length){addOnPreRun(Module[\"preRun\"].shift())}}callRuntimeCallbacks(onPreRuns)}function initRuntime(){runtimeInitialized=true;if(ENVIRONMENT_IS_PTHREAD)return startWorker();if(!Module[\"noFSInit\"]&&!FS.initialized)FS.init();TTY.init();wasmExports[\"__wasm_call_ctors\"]();FS.ignorePermissions=false}function preMain(){}function postRun(){if(ENVIRONMENT_IS_PTHREAD){return}if(Module[\"postRun\"]){if(typeof Module[\"postRun\"]==\"function\")Module[\"postRun\"]=[Module[\"postRun\"]];while(Module[\"postRun\"].length){addOnPostRun(Module[\"postRun\"].shift())}}callRuntimeCallbacks(onPostRuns)}function abort(what){Module[\"onAbort\"]?.(what);what=\"Aborted(\"+what+\")\";err(what);ABORT=true;what+=\". Build with -sASSERTIONS for more info.\";if(runtimeInitialized){___trap()}var e=new WebAssembly.RuntimeError(what);throw e}var wasmBinaryFile;function findWasmBinary(){return locateFile(\"wllama.wasm\")}function getBinarySync(file){if(file==wasmBinaryFile&&wasmBinary){return new Uint8Array(wasmBinary)}if(readBinary){return readBinary(file)}throw\"both async and sync fetching of the wasm failed\"}async function getWasmBinary(binaryFile){if(!wasmBinary){try{var response=await readAsync(binaryFile);return new Uint8Array(response)}catch{}}return getBinarySync(binaryFile)}async function instantiateArrayBuffer(binaryFile,imports){try{var binary=await getWasmBinary(binaryFile);var instance=await WebAssembly.instantiate(binary,imports);return instance}catch(reason){err(`failed to asynchronously prepare wasm: ${reason}`);abort(reason)}}async function instantiateAsync(binary,binaryFile,imports){if(!binary&&!isFileURI(binaryFile)&&!ENVIRONMENT_IS_NODE){try{var response=fetch(binaryFile,{credentials:\"same-origin\"});var instantiationResult=await WebAssembly.instantiateStreaming(response,imports);return instantiationResult}catch(reason){err(`wasm streaming compile failed: ${reason}`);err(\"falling back to ArrayBuffer instantiation\")}}return instantiateArrayBuffer(binaryFile,imports)}function getWasmImports(){assignWasmImports();if(!wasmImports.__instrumented){wasmImports.__instrumented=true;Asyncify.instrumentWasmImports(wasmImports)}var imports={env:wasmImports,wasi_snapshot_preview1:wasmImports};return imports}async function createWasm(){function receiveInstance(instance,module){wasmExports=instance.exports;wasmExports=Asyncify.instrumentWasmExports(wasmExports);wasmExports=applySignatureConversions(wasmExports);registerTLSInit(wasmExports[\"_emscripten_tls_init\"]);assignWasmExports(wasmExports);wasmModule=module;removeRunDependency(\"wasm-instantiate\");return wasmExports}addRunDependency(\"wasm-instantiate\");function receiveInstantiationResult(result){return receiveInstance(result[\"instance\"],result[\"module\"])}var info=getWasmImports();if(Module[\"instantiateWasm\"]){return new Promise((resolve,reject)=>{Module[\"instantiateWasm\"](info,(inst,mod)=>{resolve(receiveInstance(inst,mod))})})}if(ENVIRONMENT_IS_PTHREAD){var instance=new WebAssembly.Instance(wasmModule,getWasmImports());return receiveInstance(instance,wasmModule)}wasmBinaryFile??=findWasmBinary();var result=await instantiateAsync(wasmBinary,wasmBinaryFile,info);var exports=receiveInstantiationResult(result);return exports}class ExitStatus{name=\"ExitStatus\";constructor(status){this.message=`Program terminated with exit(${status})`;this.status=status}}var terminateWorker=worker=>{worker.terminate();worker.onmessage=e=>{}};var cleanupThread=pthread_ptr=>{var worker=PThread.pthreads[pthread_ptr];PThread.returnWorkerToPool(worker)};var callRuntimeCallbacks=callbacks=>{while(callbacks.length>0){callbacks.shift()(Module)}};var onPreRuns=[];var addOnPreRun=cb=>onPreRuns.push(cb);var runDependencies=0;var dependenciesFulfilled=null;var removeRunDependency=id=>{runDependencies--;Module[\"monitorRunDependencies\"]?.(runDependencies);if(runDependencies==0){if(dependenciesFulfilled){var callback=dependenciesFulfilled;dependenciesFulfilled=null;callback()}}};var addRunDependency=id=>{runDependencies++;Module[\"monitorRunDependencies\"]?.(runDependencies)};var spawnThread=threadParams=>{var worker=PThread.getNewWorker();if(!worker){return 6}PThread.runningWorkers.push(worker);PThread.pthreads[threadParams.pthread_ptr]=worker;worker.pthread_ptr=threadParams.pthread_ptr;var msg={cmd:\"run\",start_routine:threadParams.startRoutine,arg:threadParams.arg,pthread_ptr:threadParams.pthread_ptr};if(ENVIRONMENT_IS_NODE){worker.unref()}worker.postMessage(msg,threadParams.transferList);return 0};var runtimeKeepaliveCounter=0;var keepRuntimeAlive=()=>noExitRuntime||runtimeKeepaliveCounter>0;var stackSave=()=>_emscripten_stack_get_current();var stackRestore=val=>__emscripten_stack_restore(val);var stackAlloc=sz=>__emscripten_stack_alloc(sz);var proxyToMainThread=(funcIndex,emAsmAddr,sync,...callArgs)=>{var serializedNumCallArgs=callArgs.length*2;var sp=stackSave();var args=stackAlloc(serializedNumCallArgs*8);var b=args/8;for(var i=0;i<callArgs.length;i++){var arg=callArgs[i];if(typeof arg==\"bigint\"){(growMemViews(),HEAP64)[b+2*i]=1n;(growMemViews(),HEAP64)[b+2*i+1]=arg}else{(growMemViews(),HEAP64)[b+2*i]=0n;(growMemViews(),HEAPF64)[b+2*i+1]=arg}}var rtn=__emscripten_run_js_on_main_thread(funcIndex,emAsmAddr,serializedNumCallArgs,args,sync);stackRestore(sp);return rtn};function _proc_exit(code){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(0,0,1,code);EXITSTATUS=code;if(!keepRuntimeAlive()){PThread.terminateAllThreads();Module[\"onExit\"]?.(code);ABORT=true}quit_(code,new ExitStatus(code))}function exitOnMainThread(returnCode){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(1,0,0,returnCode);_exit(returnCode)}var exitJS=(status,implicit)=>{EXITSTATUS=status;if(ENVIRONMENT_IS_PTHREAD){exitOnMainThread(status);throw\"unwind\"}_proc_exit(status)};var _exit=exitJS;var PThread={unusedWorkers:[],runningWorkers:[],tlsInitFunctions:[],pthreads:{},init(){if(!ENVIRONMENT_IS_PTHREAD){PThread.initMainThread()}},initMainThread(){var pthreadPoolSize=Module[\"pthreadPoolSize\"];while(pthreadPoolSize--){PThread.allocateUnusedWorker()}addOnPreRun(async()=>{var pthreadPoolReady=PThread.loadWasmModuleToAllWorkers();addRunDependency(\"loading-workers\");await pthreadPoolReady;removeRunDependency(\"loading-workers\")})},terminateAllThreads:()=>{for(var worker of PThread.runningWorkers){terminateWorker(worker)}for(var worker of PThread.unusedWorkers){terminateWorker(worker)}PThread.unusedWorkers=[];PThread.runningWorkers=[];PThread.pthreads={}},returnWorkerToPool:worker=>{var pthread_ptr=worker.pthread_ptr;delete PThread.pthreads[pthread_ptr];PThread.unusedWorkers.push(worker);PThread.runningWorkers.splice(PThread.runningWorkers.indexOf(worker),1);worker.pthread_ptr=0;__emscripten_thread_free_data(pthread_ptr)},threadInitTLS(){PThread.tlsInitFunctions.forEach(f=>f())},loadWasmModuleToWorker:worker=>new Promise(onFinishedLoading=>{worker.onmessage=e=>{var d=e[\"data\"];var cmd=d.cmd;if(d.targetThread&&d.targetThread!=_pthread_self()){var targetWorker=PThread.pthreads[d.targetThread];if(targetWorker){targetWorker.postMessage(d,d.transferList)}else{err(`Internal error! Worker sent a message \"${cmd}\" to target pthread ${d.targetThread}, but that thread no longer exists!`)}return}if(cmd===\"checkMailbox\"){checkMailbox()}else if(cmd===\"spawnThread\"){spawnThread(d)}else if(cmd===\"cleanupThread\"){callUserCallback(()=>cleanupThread(d.thread))}else if(cmd===\"loaded\"){worker.loaded=true;if(ENVIRONMENT_IS_NODE&&!worker.pthread_ptr){worker.unref()}onFinishedLoading(worker)}else if(d.target===\"setimmediate\"){worker.postMessage(d)}else if(cmd===\"uncaughtException\"){worker.onerror(d.error)}else if(cmd===\"callHandler\"){Module[d.handler](...d.args)}else if(cmd){err(`worker sent an unknown command ${cmd}`)}};worker.onerror=e=>{var message=\"worker sent an error!\";err(`${message} ${e.filename}:${e.lineno}: ${e.message}`);throw e};if(ENVIRONMENT_IS_NODE){worker.on(\"message\",data=>worker.onmessage({data}));worker.on(\"error\",e=>worker.onerror(e))}var handlers=[];var knownHandlers=[\"onExit\",\"onAbort\",\"print\",\"printErr\"];for(var handler of knownHandlers){if(Module.propertyIsEnumerable(handler)){handlers.push(handler)}}worker.postMessage({cmd:\"load\",handlers,wasmMemory,wasmModule})}),async loadWasmModuleToAllWorkers(){if(ENVIRONMENT_IS_PTHREAD){return}let pthreadPoolReady=Promise.all(PThread.unusedWorkers.map(PThread.loadWasmModuleToWorker));return pthreadPoolReady},allocateUnusedWorker(){var worker;var pthreadMainJs=_scriptName;if(Module[\"mainScriptUrlOrBlob\"]){pthreadMainJs=Module[\"mainScriptUrlOrBlob\"];if(typeof pthreadMainJs!=\"string\"){pthreadMainJs=URL.createObjectURL(pthreadMainJs)}}worker=new Worker(pthreadMainJs,{workerData:\"em-pthread\",name:\"em-pthread\"});PThread.unusedWorkers.push(worker)},getNewWorker(){if(PThread.unusedWorkers.length==0){PThread.allocateUnusedWorker();PThread.loadWasmModuleToWorker(PThread.unusedWorkers[0])}return PThread.unusedWorkers.pop()}};var onPostRuns=[];var addOnPostRun=cb=>onPostRuns.push(cb);function establishStackSpace(pthread_ptr){var stackHigh=Number((growMemViews(),HEAPU64)[(pthread_ptr+88)/8]);var stackSize=Number((growMemViews(),HEAPU64)[(pthread_ptr+96)/8]);var stackLow=stackHigh-stackSize;_emscripten_stack_set_limits(stackHigh,stackLow);stackRestore(stackHigh)}var wasmTableMirror=[];var getWasmTableEntry=funcPtr=>{funcPtr=Number(funcPtr);var func=wasmTableMirror[funcPtr];if(!func){wasmTableMirror[funcPtr]=func=wasmTable.get(BigInt(funcPtr));if(Asyncify.isAsyncExport(func)){wasmTableMirror[funcPtr]=func=Asyncify.makeAsyncFunction(func)}}return func};var invokeEntryPoint=async(ptr,arg)=>{runtimeKeepaliveCounter=0;noExitRuntime=0;var result=(a1=>WebAssembly.promising(getWasmTableEntry(ptr)).call(null,BigInt(a1)))(arg);function finish(result){if(keepRuntimeAlive()){EXITSTATUS=result;return}__emscripten_thread_exit(result)}result=await result;finish(result)};invokeEntryPoint.isAsync=true;var noExitRuntime=true;var registerTLSInit=tlsInitFunc=>PThread.tlsInitFunctions.push(tlsInitFunc);var wasmMemory;function pthreadCreateProxied(pthread_ptr,attr,startRoutine,arg){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(2,0,1,pthread_ptr,attr,startRoutine,arg);return ___pthread_create_js(pthread_ptr,attr,startRoutine,arg)}var _emscripten_has_threading_support=()=>!!globalThis.SharedArrayBuffer;var INT53_MAX=9007199254740992;var INT53_MIN=-9007199254740992;var bigintToI53Checked=num=>num<INT53_MIN||num>INT53_MAX?NaN:Number(num);function ___pthread_create_js(pthread_ptr,attr,startRoutine,arg){pthread_ptr=bigintToI53Checked(pthread_ptr);attr=bigintToI53Checked(attr);startRoutine=bigintToI53Checked(startRoutine);arg=bigintToI53Checked(arg);if(!_emscripten_has_threading_support()){return 6}var transferList=[];var error=0;if(ENVIRONMENT_IS_PTHREAD&&(transferList.length===0||error)){return pthreadCreateProxied(pthread_ptr,attr,startRoutine,arg)}if(error)return error;var threadParams={startRoutine,pthread_ptr,arg,transferList};if(ENVIRONMENT_IS_PTHREAD){threadParams.cmd=\"spawnThread\";postMessage(threadParams,transferList);return 0}return spawnThread(threadParams)}var syscallGetVarargP=()=>{var ret=Number((growMemViews(),HEAPU64)[SYSCALLS.varargs/8]);SYSCALLS.varargs+=8;return ret};var syscallGetVarargI=()=>{var ret=(growMemViews(),HEAP32)[+SYSCALLS.varargs/4];SYSCALLS.varargs+=4;return ret};var PATH={isAbs:path=>path.charAt(0)===\"/\",splitPath:filename=>{var splitPathRe=/^(\\/?|)([\\s\\S]*?)((?:\\.{1,2}|[^\\/]+?|)(\\.[^.\\/]*|))(?:[\\/]*)$/;return splitPathRe.exec(filename).slice(1)},normalizeArray:(parts,allowAboveRoot)=>{var up=0;for(var i=parts.length-1;i>=0;i--){var last=parts[i];if(last===\".\"){parts.splice(i,1)}else if(last===\"..\"){parts.splice(i,1);up++}else if(up){parts.splice(i,1);up--}}if(allowAboveRoot){for(;up;up--){parts.unshift(\"..\")}}return parts},normalize:path=>{var isAbsolute=PATH.isAbs(path),trailingSlash=path.slice(-1)===\"/\";path=PATH.normalizeArray(path.split(\"/\").filter(p=>!!p),!isAbsolute).join(\"/\");if(!path&&!isAbsolute){path=\".\"}if(path&&trailingSlash){path+=\"/\"}return(isAbsolute?\"/\":\"\")+path},dirname:path=>{var result=PATH.splitPath(path),root=result[0],dir=result[1];if(!root&&!dir){return\".\"}if(dir){dir=dir.slice(0,-1)}return root+dir},basename:path=>path&&path.match(/([^\\/]+|\\/)\\/*$/)[1],join:(...paths)=>PATH.normalize(paths.join(\"/\")),join2:(l,r)=>PATH.normalize(l+\"/\"+r)};var initRandomFill=()=>view=>view.set(crypto.getRandomValues(new Uint8Array(view.byteLength)));var randomFill=view=>{(randomFill=initRandomFill())(view)};var PATH_FS={resolve:(...args)=>{var resolvedPath=\"\",resolvedAbsolute=false;for(var i=args.length-1;i>=-1&&!resolvedAbsolute;i--){var path=i>=0?args[i]:FS.cwd();if(typeof path!=\"string\"){throw new TypeError(\"Arguments to path.resolve must be strings\")}else if(!path){return\"\"}resolvedPath=path+\"/\"+resolvedPath;resolvedAbsolute=PATH.isAbs(path)}resolvedPath=PATH.normalizeArray(resolvedPath.split(\"/\").filter(p=>!!p),!resolvedAbsolute).join(\"/\");return(resolvedAbsolute?\"/\":\"\")+resolvedPath||\".\"},relative:(from,to)=>{from=PATH_FS.resolve(from).slice(1);to=PATH_FS.resolve(to).slice(1);function trim(arr){var start=0;for(;start<arr.length;start++){if(arr[start]!==\"\")break}var end=arr.length-1;for(;end>=0;end--){if(arr[end]!==\"\")break}if(start>end)return[];return arr.slice(start,end-start+1)}var fromParts=trim(from.split(\"/\"));var toParts=trim(to.split(\"/\"));var length=Math.min(fromParts.length,toParts.length);var samePartsLength=length;for(var i=0;i<length;i++){if(fromParts[i]!==toParts[i]){samePartsLength=i;break}}var outputParts=[];for(var i=samePartsLength;i<fromParts.length;i++){outputParts.push(\"..\")}outputParts=outputParts.concat(toParts.slice(samePartsLength));return outputParts.join(\"/\")}};var UTF8Decoder=globalThis.TextDecoder&&new TextDecoder;var findStringEnd=(heapOrArray,idx,maxBytesToRead,ignoreNul)=>{var maxIdx=idx+maxBytesToRead;if(ignoreNul)return maxIdx;while(heapOrArray[idx]&&!(idx>=maxIdx))++idx;return idx};var UTF8ArrayToString=(heapOrArray,idx=0,maxBytesToRead,ignoreNul)=>{var endPtr=findStringEnd(heapOrArray,idx,maxBytesToRead,ignoreNul);if(endPtr-idx>16&&heapOrArray.buffer&&UTF8Decoder){return UTF8Decoder.decode(heapOrArray.buffer instanceof ArrayBuffer?heapOrArray.subarray(idx,endPtr):heapOrArray.slice(idx,endPtr))}var str=\"\";while(idx<endPtr){var u0=heapOrArray[idx++];if(!(u0&128)){str+=String.fromCharCode(u0);continue}var u1=heapOrArray[idx++]&63;if((u0&224)==192){str+=String.fromCharCode((u0&31)<<6|u1);continue}var u2=heapOrArray[idx++]&63;if((u0&240)==224){u0=(u0&15)<<12|u1<<6|u2}else{u0=(u0&7)<<18|u1<<12|u2<<6|heapOrArray[idx++]&63}if(u0<65536){str+=String.fromCharCode(u0)}else{var ch=u0-65536;str+=String.fromCharCode(55296|ch>>10,56320|ch&1023)}}return str};var FS_stdin_getChar_buffer=[];var lengthBytesUTF8=str=>{var len=0;for(var i=0;i<str.length;++i){var c=str.charCodeAt(i);if(c<=127){len++}else if(c<=2047){len+=2}else if(c>=55296&&c<=57343){len+=4;++i}else{len+=3}}return len};var stringToUTF8Array=(str,heap,outIdx,maxBytesToWrite)=>{if(!(maxBytesToWrite>0))return 0;var startIdx=outIdx;var endIdx=outIdx+maxBytesToWrite-1;for(var i=0;i<str.length;++i){var u=str.codePointAt(i);if(u<=127){if(outIdx>=endIdx)break;heap[outIdx++]=u}else if(u<=2047){if(outIdx+1>=endIdx)break;heap[outIdx++]=192|u>>6;heap[outIdx++]=128|u&63}else if(u<=65535){if(outIdx+2>=endIdx)break;heap[outIdx++]=224|u>>12;heap[outIdx++]=128|u>>6&63;heap[outIdx++]=128|u&63}else{if(outIdx+3>=endIdx)break;heap[outIdx++]=240|u>>18;heap[outIdx++]=128|u>>12&63;heap[outIdx++]=128|u>>6&63;heap[outIdx++]=128|u&63;i++}}heap[outIdx]=0;return outIdx-startIdx};var intArrayFromString=(stringy,dontAddNull,length)=>{var len=length>0?length:lengthBytesUTF8(stringy)+1;var u8array=new Array(len);var numBytesWritten=stringToUTF8Array(stringy,u8array,0,u8array.length);if(dontAddNull)u8array.length=numBytesWritten;return u8array};var FS_stdin_getChar=()=>{if(!FS_stdin_getChar_buffer.length){var result=null;if(ENVIRONMENT_IS_NODE){var BUFSIZE=256;var buf=Buffer.alloc(BUFSIZE);var bytesRead=0;var fd=process.stdin.fd;try{bytesRead=fs.readSync(fd,buf,0,BUFSIZE)}catch(e){if(e.toString().includes(\"EOF\"))bytesRead=0;else throw e}if(bytesRead>0){result=buf.slice(0,bytesRead).toString(\"utf-8\")}}else if(globalThis.window?.prompt){result=window.prompt(\"Input: \");if(result!==null){result+=\"\\n\"}}else{}if(!result){return null}FS_stdin_getChar_buffer=intArrayFromString(result,true)}return FS_stdin_getChar_buffer.shift()};var TTY={ttys:[],init(){},shutdown(){},register(dev,ops){TTY.ttys[dev]={input:[],output:[],ops};FS.registerDevice(dev,TTY.stream_ops)},stream_ops:{open(stream){var tty=TTY.ttys[stream.node.rdev];if(!tty){throw new FS.ErrnoError(43)}stream.tty=tty;stream.seekable=false},close(stream){stream.tty.ops.fsync(stream.tty)},fsync(stream){stream.tty.ops.fsync(stream.tty)},read(stream,buffer,offset,length,pos){if(!stream.tty||!stream.tty.ops.get_char){throw new FS.ErrnoError(60)}var bytesRead=0;for(var i=0;i<length;i++){var result;try{result=stream.tty.ops.get_char(stream.tty)}catch(e){throw new FS.ErrnoError(29)}if(result===undefined&&bytesRead===0){throw new FS.ErrnoError(6)}if(result===null||result===undefined)break;bytesRead++;buffer[offset+i]=result}if(bytesRead){stream.node.atime=Date.now()}return bytesRead},write(stream,buffer,offset,length,pos){if(!stream.tty||!stream.tty.ops.put_char){throw new FS.ErrnoError(60)}try{for(var i=0;i<length;i++){stream.tty.ops.put_char(stream.tty,buffer[offset+i])}}catch(e){throw new FS.ErrnoError(29)}if(length){stream.node.mtime=stream.node.ctime=Date.now()}return i}},default_tty_ops:{get_char(tty){return FS_stdin_getChar()},put_char(tty,val){if(val===null||val===10){out(UTF8ArrayToString(tty.output));tty.output=[]}else{if(val!=0)tty.output.push(val)}},fsync(tty){if(tty.output?.length>0){out(UTF8ArrayToString(tty.output));tty.output=[]}},ioctl_tcgets(tty){return{c_iflag:25856,c_oflag:5,c_cflag:191,c_lflag:35387,c_cc:[3,28,127,21,4,0,1,0,17,19,26,0,18,15,23,22,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}},ioctl_tcsets(tty,optional_actions,data){return 0},ioctl_tiocgwinsz(tty){return[24,80]}},default_tty1_ops:{put_char(tty,val){if(val===null||val===10){err(UTF8ArrayToString(tty.output));tty.output=[]}else{if(val!=0)tty.output.push(val)}},fsync(tty){if(tty.output?.length>0){err(UTF8ArrayToString(tty.output));tty.output=[]}}}};var zeroMemory=(ptr,size)=>(growMemViews(),HEAPU8).fill(0,ptr,ptr+size);var alignMemory=(size,alignment)=>Math.ceil(size/alignment)*alignment;var mmapAlloc=size=>{size=alignMemory(size,65536);var ptr=_emscripten_builtin_memalign(65536,size);if(ptr)zeroMemory(ptr,size);return ptr};var MEMFS={ops_table:null,mount(mount){return MEMFS.createNode(null,\"/\",16895,0)},createNode(parent,name,mode,dev){if(FS.isBlkdev(mode)||FS.isFIFO(mode)){throw new FS.ErrnoError(63)}MEMFS.ops_table||={dir:{node:{getattr:MEMFS.node_ops.getattr,setattr:MEMFS.node_ops.setattr,lookup:MEMFS.node_ops.lookup,mknod:MEMFS.node_ops.mknod,rename:MEMFS.node_ops.rename,unlink:MEMFS.node_ops.unlink,rmdir:MEMFS.node_ops.rmdir,readdir:MEMFS.node_ops.readdir,symlink:MEMFS.node_ops.symlink},stream:{llseek:MEMFS.stream_ops.llseek}},file:{node:{getattr:MEMFS.node_ops.getattr,setattr:MEMFS.node_ops.setattr},stream:{llseek:MEMFS.stream_ops.llseek,read:MEMFS.stream_ops.read,write:MEMFS.stream_ops.write,mmap:MEMFS.stream_ops.mmap,msync:MEMFS.stream_ops.msync}},link:{node:{getattr:MEMFS.node_ops.getattr,setattr:MEMFS.node_ops.setattr,readlink:MEMFS.node_ops.readlink},stream:{}},chrdev:{node:{getattr:MEMFS.node_ops.getattr,setattr:MEMFS.node_ops.setattr},stream:FS.chrdev_stream_ops}};var node=FS.createNode(parent,name,mode,dev);if(FS.isDir(node.mode)){node.node_ops=MEMFS.ops_table.dir.node;node.stream_ops=MEMFS.ops_table.dir.stream;node.contents={}}else if(FS.isFile(node.mode)){node.node_ops=MEMFS.ops_table.file.node;node.stream_ops=MEMFS.ops_table.file.stream;node.usedBytes=0;node.contents=null}else if(FS.isLink(node.mode)){node.node_ops=MEMFS.ops_table.link.node;node.stream_ops=MEMFS.ops_table.link.stream}else if(FS.isChrdev(node.mode)){node.node_ops=MEMFS.ops_table.chrdev.node;node.stream_ops=MEMFS.ops_table.chrdev.stream}node.atime=node.mtime=node.ctime=Date.now();if(parent){parent.contents[name]=node;parent.atime=parent.mtime=parent.ctime=node.atime}return node},getFileDataAsTypedArray(node){if(!node.contents)return new Uint8Array(0);if(node.contents.subarray)return node.contents.subarray(0,node.usedBytes);return new Uint8Array(node.contents)},expandFileStorage(node,newCapacity){var prevCapacity=node.contents?node.contents.length:0;if(prevCapacity>=newCapacity)return;var CAPACITY_DOUBLING_MAX=1024*1024;newCapacity=Math.max(newCapacity,prevCapacity*(prevCapacity<CAPACITY_DOUBLING_MAX?2:1.125)>>>0);if(prevCapacity!=0)newCapacity=Math.max(newCapacity,256);var oldContents=node.contents;node.contents=new Uint8Array(newCapacity);if(node.usedBytes>0)node.contents.set(oldContents.subarray(0,node.usedBytes),0)},resizeFileStorage(node,newSize){if(node.usedBytes==newSize)return;if(newSize==0){node.contents=null;node.usedBytes=0}else{var oldContents=node.contents;node.contents=new Uint8Array(newSize);if(oldContents){node.contents.set(oldContents.subarray(0,Math.min(newSize,node.usedBytes)))}node.usedBytes=newSize}},node_ops:{getattr(node){var attr={};attr.dev=FS.isChrdev(node.mode)?node.id:1;attr.ino=node.id;attr.mode=node.mode;attr.nlink=1;attr.uid=0;attr.gid=0;attr.rdev=node.rdev;if(FS.isDir(node.mode)){attr.size=4096}else if(FS.isFile(node.mode)){attr.size=node.usedBytes}else if(FS.isLink(node.mode)){attr.size=node.link.length}else{attr.size=0}attr.atime=new Date(node.atime);attr.mtime=new Date(node.mtime);attr.ctime=new Date(node.ctime);attr.blksize=4096;attr.blocks=Math.ceil(attr.size/attr.blksize);return attr},setattr(node,attr){for(const key of[\"mode\",\"atime\",\"mtime\",\"ctime\"]){if(attr[key]!=null){node[key]=attr[key]}}if(attr.size!==undefined){MEMFS.resizeFileStorage(node,attr.size)}},lookup(parent,name){if(!MEMFS.doesNotExistError){MEMFS.doesNotExistError=new FS.ErrnoError(44);MEMFS.doesNotExistError.stack=\"<generic error, no stack>\"}throw MEMFS.doesNotExistError},mknod(parent,name,mode,dev){return MEMFS.createNode(parent,name,mode,dev)},rename(old_node,new_dir,new_name){var new_node;try{new_node=FS.lookupNode(new_dir,new_name)}catch(e){}if(new_node){if(FS.isDir(old_node.mode)){for(var i in new_node.contents){throw new FS.ErrnoError(55)}}FS.hashRemoveNode(new_node)}delete old_node.parent.contents[old_node.name];new_dir.contents[new_name]=old_node;old_node.name=new_name;new_dir.ctime=new_dir.mtime=old_node.parent.ctime=old_node.parent.mtime=Date.now()},unlink(parent,name){delete parent.contents[name];parent.ctime=parent.mtime=Date.now()},rmdir(parent,name){var node=FS.lookupNode(parent,name);for(var i in node.contents){throw new FS.ErrnoError(55)}delete parent.contents[name];parent.ctime=parent.mtime=Date.now()},readdir(node){return[\".\",\"..\",...Object.keys(node.contents)]},symlink(parent,newname,oldpath){var node=MEMFS.createNode(parent,newname,511|40960,0);node.link=oldpath;return node},readlink(node){if(!FS.isLink(node.mode)){throw new FS.ErrnoError(28)}return node.link}},stream_ops:{read(stream,buffer,offset,length,position){var contents=stream.node.contents;if(position>=stream.node.usedBytes)return 0;var size=Math.min(stream.node.usedBytes-position,length);if(size>8&&contents.subarray){buffer.set(contents.subarray(position,position+size),offset)}else{for(var i=0;i<size;i++)buffer[offset+i]=contents[position+i]}return size},write(stream,buffer,offset,length,position,canOwn){if(buffer.buffer===(growMemViews(),HEAP8).buffer){canOwn=false}if(!length)return 0;var node=stream.node;node.mtime=node.ctime=Date.now();if(buffer.subarray&&(!node.contents||node.contents.subarray)){if(canOwn){node.contents=buffer.subarray(offset,offset+length);node.usedBytes=length;return length}else if(node.usedBytes===0&&position===0){node.contents=buffer.slice(offset,offset+length);node.usedBytes=length;return length}else if(position+length<=node.usedBytes){node.contents.set(buffer.subarray(offset,offset+length),position);return length}}MEMFS.expandFileStorage(node,position+length);if(node.contents.subarray&&buffer.subarray){node.contents.set(buffer.subarray(offset,offset+length),position)}else{for(var i=0;i<length;i++){node.contents[position+i]=buffer[offset+i]}}node.usedBytes=Math.max(node.usedBytes,position+length);return length},llseek(stream,offset,whence){var position=offset;if(whence===1){position+=stream.position}else if(whence===2){if(FS.isFile(stream.node.mode)){position+=stream.node.usedBytes}}if(position<0){throw new FS.ErrnoError(28)}return position},mmap(stream,length,position,prot,flags){if(!FS.isFile(stream.node.mode)){throw new FS.ErrnoError(43)}var ptr;var allocated;var contents=stream.node.contents;if(!(flags&2)&&contents&&contents.buffer===(growMemViews(),HEAP8).buffer){allocated=false;ptr=contents.byteOffset}else{allocated=true;ptr=mmapAlloc(length);if(!ptr){throw new FS.ErrnoError(48)}if(contents){if(position>0||position+length<contents.length){if(contents.subarray){contents=contents.subarray(position,position+length)}else{contents=Array.prototype.slice.call(contents,position,position+length)}}(growMemViews(),HEAP8).set(contents,ptr)}}return{ptr,allocated}},msync(stream,buffer,offset,length,mmapFlags){MEMFS.stream_ops.write(stream,buffer,0,length,offset,false);return 0}}};var FS_modeStringToFlags=str=>{var flagModes={r:0,\"r+\":2,w:512|64|1,\"w+\":512|64|2,a:1024|64|1,\"a+\":1024|64|2};var flags=flagModes[str];if(typeof flags==\"undefined\"){throw new Error(`Unknown file open mode: ${str}`)}return flags};var FS_getMode=(canRead,canWrite)=>{var mode=0;if(canRead)mode|=292|73;if(canWrite)mode|=146;return mode};var asyncLoad=async url=>{var arrayBuffer=await readAsync(url);return new Uint8Array(arrayBuffer)};var FS_createDataFile=(...args)=>FS.createDataFile(...args);var getUniqueRunDependency=id=>id;var preloadPlugins=[];var FS_handledByPreloadPlugin=async(byteArray,fullname)=>{if(typeof Browser!=\"undefined\")Browser.init();for(var plugin of preloadPlugins){if(plugin[\"canHandle\"](fullname)){return plugin[\"handle\"](byteArray,fullname)}}return byteArray};var FS_preloadFile=async(parent,name,url,canRead,canWrite,dontCreateFile,canOwn,preFinish)=>{var fullname=name?PATH_FS.resolve(PATH.join2(parent,name)):parent;var dep=getUniqueRunDependency(`cp ${fullname}`);addRunDependency(dep);try{var byteArray=url;if(typeof url==\"string\"){byteArray=await asyncLoad(url)}byteArray=await FS_handledByPreloadPlugin(byteArray,fullname);preFinish?.();if(!dontCreateFile){FS_createDataFile(parent,name,byteArray,canRead,canWrite,canOwn)}}finally{removeRunDependency(dep)}};var FS_createPreloadedFile=(parent,name,url,canRead,canWrite,onload,onerror,dontCreateFile,canOwn,preFinish)=>{FS_preloadFile(parent,name,url,canRead,canWrite,dontCreateFile,canOwn,preFinish).then(onload).catch(onerror)};var FS={root:null,mounts:[],devices:{},streams:[],nextInode:1,nameTable:null,currentPath:\"/\",initialized:false,ignorePermissions:true,filesystems:null,syncFSRequests:0,readFiles:{},ErrnoError:class{name=\"ErrnoError\";constructor(errno){this.errno=errno}},FSStream:class{shared={};get object(){return this.node}set object(val){this.node=val}get isRead(){return(this.flags&2097155)!==1}get isWrite(){return(this.flags&2097155)!==0}get isAppend(){return this.flags&1024}get flags(){return this.shared.flags}set flags(val){this.shared.flags=val}get position(){return this.shared.position}set position(val){this.shared.position=val}},FSNode:class{node_ops={};stream_ops={};readMode=292|73;writeMode=146;mounted=null;constructor(parent,name,mode,rdev){if(!parent){parent=this}this.parent=parent;this.mount=parent.mount;this.id=FS.nextInode++;this.name=name;this.mode=mode;this.rdev=rdev;this.atime=this.mtime=this.ctime=Date.now()}get read(){return(this.mode&this.readMode)===this.readMode}set read(val){val?this.mode|=this.readMode:this.mode&=~this.readMode}get write(){return(this.mode&this.writeMode)===this.writeMode}set write(val){val?this.mode|=this.writeMode:this.mode&=~this.writeMode}get isFolder(){return FS.isDir(this.mode)}get isDevice(){return FS.isChrdev(this.mode)}},lookupPath(path,opts={}){if(!path){throw new FS.ErrnoError(44)}opts.follow_mount??=true;if(!PATH.isAbs(path)){path=FS.cwd()+\"/\"+path}linkloop:for(var nlinks=0;nlinks<40;nlinks++){var parts=path.split(\"/\").filter(p=>!!p);var current=FS.root;var current_path=\"/\";for(var i=0;i<parts.length;i++){var islast=i===parts.length-1;if(islast&&opts.parent){break}if(parts[i]===\".\"){continue}if(parts[i]===\"..\"){current_path=PATH.dirname(current_path);if(FS.isRoot(current)){path=current_path+\"/\"+parts.slice(i+1).join(\"/\");nlinks--;continue linkloop}else{current=current.parent}continue}current_path=PATH.join2(current_path,parts[i]);try{current=FS.lookupNode(current,parts[i])}catch(e){if(e?.errno===44&&islast&&opts.noent_okay){return{path:current_path}}throw e}if(FS.isMountpoint(current)&&(!islast||opts.follow_mount)){current=current.mounted.root}if(FS.isLink(current.mode)&&(!islast||opts.follow)){if(!current.node_ops.readlink){throw new FS.ErrnoError(52)}var link=current.node_ops.readlink(current);if(!PATH.isAbs(link)){link=PATH.dirname(current_path)+\"/\"+link}path=link+\"/\"+parts.slice(i+1).join(\"/\");continue linkloop}}return{path:current_path,node:current}}throw new FS.ErrnoError(32)},getPath(node){var path;while(true){if(FS.isRoot(node)){var mount=node.mount.mountpoint;if(!path)return mount;return mount[mount.length-1]!==\"/\"?`${mount}/${path}`:mount+path}path=path?`${node.name}/${path}`:node.name;node=node.parent}},hashName(parentid,name){var hash=0;for(var i=0;i<name.length;i++){hash=(hash<<5)-hash+name.charCodeAt(i)|0}return(parentid+hash>>>0)%FS.nameTable.length},hashAddNode(node){var hash=FS.hashName(node.parent.id,node.name);node.name_next=FS.nameTable[hash];FS.nameTable[hash]=node},hashRemoveNode(node){var hash=FS.hashName(node.parent.id,node.name);if(FS.nameTable[hash]===node){FS.nameTable[hash]=node.name_next}else{var current=FS.nameTable[hash];while(current){if(current.name_next===node){current.name_next=node.name_next;break}current=current.name_next}}},lookupNode(parent,name){var errCode=FS.mayLookup(parent);if(errCode){throw new FS.ErrnoError(errCode)}var hash=FS.hashName(parent.id,name);for(var node=FS.nameTable[hash];node;node=node.name_next){var nodeName=node.name;if(node.parent.id===parent.id&&nodeName===name){return node}}return FS.lookup(parent,name)},createNode(parent,name,mode,rdev){var node=new FS.FSNode(parent,name,mode,rdev);FS.hashAddNode(node);return node},destroyNode(node){FS.hashRemoveNode(node)},isRoot(node){return node===node.parent},isMountpoint(node){return!!node.mounted},isFile(mode){return(mode&61440)===32768},isDir(mode){return(mode&61440)===16384},isLink(mode){return(mode&61440)===40960},isChrdev(mode){return(mode&61440)===8192},isBlkdev(mode){return(mode&61440)===24576},isFIFO(mode){return(mode&61440)===4096},isSocket(mode){return(mode&49152)===49152},flagsToPermissionString(flag){var perms=[\"r\",\"w\",\"rw\"][flag&3];if(flag&512){perms+=\"w\"}return perms},nodePermissions(node,perms){if(FS.ignorePermissions){return 0}if(perms.includes(\"r\")&&!(node.mode&292)){return 2}else if(perms.includes(\"w\")&&!(node.mode&146)){return 2}else if(perms.includes(\"x\")&&!(node.mode&73)){return 2}return 0},mayLookup(dir){if(!FS.isDir(dir.mode))return 54;var errCode=FS.nodePermissions(dir,\"x\");if(errCode)return errCode;if(!dir.node_ops.lookup)return 2;return 0},mayCreate(dir,name){if(!FS.isDir(dir.mode)){return 54}try{var node=FS.lookupNode(dir,name);return 20}catch(e){}return FS.nodePermissions(dir,\"wx\")},mayDelete(dir,name,isdir){var node;try{node=FS.lookupNode(dir,name)}catch(e){return e.errno}var errCode=FS.nodePermissions(dir,\"wx\");if(errCode){return errCode}if(isdir){if(!FS.isDir(node.mode)){return 54}if(FS.isRoot(node)||FS.getPath(node)===FS.cwd()){return 10}}else{if(FS.isDir(node.mode)){return 31}}return 0},mayOpen(node,flags){if(!node){return 44}if(FS.isLink(node.mode)){return 32}else if(FS.isDir(node.mode)){if(FS.flagsToPermissionString(flags)!==\"r\"||flags&(512|64)){return 31}}return FS.nodePermissions(node,FS.flagsToPermissionString(flags))},checkOpExists(op,err){if(!op){throw new FS.ErrnoError(err)}return op},MAX_OPEN_FDS:4096,nextfd(){for(var fd=0;fd<=FS.MAX_OPEN_FDS;fd++){if(!FS.streams[fd]){return fd}}throw new FS.ErrnoError(33)},getStreamChecked(fd){var stream=FS.getStream(fd);if(!stream){throw new FS.ErrnoError(8)}return stream},getStream:fd=>FS.streams[fd],createStream(stream,fd=-1){stream=Object.assign(new FS.FSStream,stream);if(fd==-1){fd=FS.nextfd()}stream.fd=fd;FS.streams[fd]=stream;return stream},closeStream(fd){FS.streams[fd]=null},dupStream(origStream,fd=-1){var stream=FS.createStream(origStream,fd);stream.stream_ops?.dup?.(stream);return stream},doSetAttr(stream,node,attr){var setattr=stream?.stream_ops.setattr;var arg=setattr?stream:node;setattr??=node.node_ops.setattr;FS.checkOpExists(setattr,63);setattr(arg,attr)},chrdev_stream_ops:{open(stream){var device=FS.getDevice(stream.node.rdev);stream.stream_ops=device.stream_ops;stream.stream_ops.open?.(stream)},llseek(){throw new FS.ErrnoError(70)}},major:dev=>dev>>8,minor:dev=>dev&255,makedev:(ma,mi)=>ma<<8|mi,registerDevice(dev,ops){FS.devices[dev]={stream_ops:ops}},getDevice:dev=>FS.devices[dev],getMounts(mount){var mounts=[];var check=[mount];while(check.length){var m=check.pop();mounts.push(m);check.push(...m.mounts)}return mounts},syncfs(populate,callback){if(typeof populate==\"function\"){callback=populate;populate=false}FS.syncFSRequests++;if(FS.syncFSRequests>1){err(`warning: ${FS.syncFSRequests} FS.syncfs operations in flight at once, probably just doing extra work`)}var mounts=FS.getMounts(FS.root.mount);var completed=0;function doCallback(errCode){FS.syncFSRequests--;return callback(errCode)}function done(errCode){if(errCode){if(!done.errored){done.errored=true;return doCallback(errCode)}return}if(++completed>=mounts.length){doCallback(null)}}for(var mount of mounts){if(mount.type.syncfs){mount.type.syncfs(mount,populate,done)}else{done(null)}}},mount(type,opts,mountpoint){var root=mountpoint===\"/\";var pseudo=!mountpoint;var node;if(root&&FS.root){throw new FS.ErrnoError(10)}else if(!root&&!pseudo){var lookup=FS.lookupPath(mountpoint,{follow_mount:false});mountpoint=lookup.path;node=lookup.node;if(FS.isMountpoint(node)){throw new FS.ErrnoError(10)}if(!FS.isDir(node.mode)){throw new FS.ErrnoError(54)}}var mount={type,opts,mountpoint,mounts:[]};var mountRoot=type.mount(mount);mountRoot.mount=mount;mount.root=mountRoot;if(root){FS.root=mountRoot}else if(node){node.mounted=mount;if(node.mount){node.mount.mounts.push(mount)}}return mountRoot},unmount(mountpoint){var lookup=FS.lookupPath(mountpoint,{follow_mount:false});if(!FS.isMountpoint(lookup.node)){throw new FS.ErrnoError(28)}var node=lookup.node;var mount=node.mounted;var mounts=FS.getMounts(mount);for(var[hash,current]of Object.entries(FS.nameTable)){while(current){var next=current.name_next;if(mounts.includes(current.mount)){FS.destroyNode(current)}current=next}}node.mounted=null;var idx=node.mount.mounts.indexOf(mount);node.mount.mounts.splice(idx,1)},lookup(parent,name){return parent.node_ops.lookup(parent,name)},mknod(path,mode,dev){var lookup=FS.lookupPath(path,{parent:true});var parent=lookup.node;var name=PATH.basename(path);if(!name){throw new FS.ErrnoError(28)}if(name===\".\"||name===\"..\"){throw new FS.ErrnoError(20)}var errCode=FS.mayCreate(parent,name);if(errCode){throw new FS.ErrnoError(errCode)}if(!parent.node_ops.mknod){throw new FS.ErrnoError(63)}return parent.node_ops.mknod(parent,name,mode,dev)},statfs(path){return FS.statfsNode(FS.lookupPath(path,{follow:true}).node)},statfsStream(stream){return FS.statfsNode(stream.node)},statfsNode(node){var rtn={bsize:4096,frsize:4096,blocks:1e6,bfree:5e5,bavail:5e5,files:FS.nextInode,ffree:FS.nextInode-1,fsid:42,flags:2,namelen:255};if(node.node_ops.statfs){Object.assign(rtn,node.node_ops.statfs(node.mount.opts.root))}return rtn},create(path,mode=438){mode&=4095;mode|=32768;return FS.mknod(path,mode,0)},mkdir(path,mode=511){mode&=511|512;mode|=16384;return FS.mknod(path,mode,0)},mkdirTree(path,mode){var dirs=path.split(\"/\");var d=\"\";for(var dir of dirs){if(!dir)continue;if(d||PATH.isAbs(path))d+=\"/\";d+=dir;try{FS.mkdir(d,mode)}catch(e){if(e.errno!=20)throw e}}},mkdev(path,mode,dev){if(typeof dev==\"undefined\"){dev=mode;mode=438}mode|=8192;return FS.mknod(path,mode,dev)},symlink(oldpath,newpath){if(!PATH_FS.resolve(oldpath)){throw new FS.ErrnoError(44)}var lookup=FS.lookupPath(newpath,{parent:true});var parent=lookup.node;if(!parent){throw new FS.ErrnoError(44)}var newname=PATH.basename(newpath);var errCode=FS.mayCreate(parent,newname);if(errCode){throw new FS.ErrnoError(errCode)}if(!parent.node_ops.symlink){throw new FS.ErrnoError(63)}return parent.node_ops.symlink(parent,newname,oldpath)},rename(old_path,new_path){var old_dirname=PATH.dirname(old_path);var new_dirname=PATH.dirname(new_path);var old_name=PATH.basename(old_path);var new_name=PATH.basename(new_path);var lookup,old_dir,new_dir;lookup=FS.lookupPath(old_path,{parent:true});old_dir=lookup.node;lookup=FS.lookupPath(new_path,{parent:true});new_dir=lookup.node;if(!old_dir||!new_dir)throw new FS.ErrnoError(44);if(old_dir.mount!==new_dir.mount){throw new FS.ErrnoError(75)}var old_node=FS.lookupNode(old_dir,old_name);var relative=PATH_FS.relative(old_path,new_dirname);if(relative.charAt(0)!==\".\"){throw new FS.ErrnoError(28)}relative=PATH_FS.relative(new_path,old_dirname);if(relative.charAt(0)!==\".\"){throw new FS.ErrnoError(55)}var new_node;try{new_node=FS.lookupNode(new_dir,new_name)}catch(e){}if(old_node===new_node){return}var isdir=FS.isDir(old_node.mode);var errCode=FS.mayDelete(old_dir,old_name,isdir);if(errCode){throw new FS.ErrnoError(errCode)}errCode=new_node?FS.mayDelete(new_dir,new_name,isdir):FS.mayCreate(new_dir,new_name);if(errCode){throw new FS.ErrnoError(errCode)}if(!old_dir.node_ops.rename){throw new FS.ErrnoError(63)}if(FS.isMountpoint(old_node)||new_node&&FS.isMountpoint(new_node)){throw new FS.ErrnoError(10)}if(new_dir!==old_dir){errCode=FS.nodePermissions(old_dir,\"w\");if(errCode){throw new FS.ErrnoError(errCode)}}FS.hashRemoveNode(old_node);try{old_dir.node_ops.rename(old_node,new_dir,new_name);old_node.parent=new_dir}catch(e){throw e}finally{FS.hashAddNode(old_node)}},rmdir(path){var lookup=FS.lookupPath(path,{parent:true});var parent=lookup.node;var name=PATH.basename(path);var node=FS.lookupNode(parent,name);var errCode=FS.mayDelete(parent,name,true);if(errCode){throw new FS.ErrnoError(errCode)}if(!parent.node_ops.rmdir){throw new FS.ErrnoError(63)}if(FS.isMountpoint(node)){throw new FS.ErrnoError(10)}parent.node_ops.rmdir(parent,name);FS.destroyNode(node)},readdir(path){var lookup=FS.lookupPath(path,{follow:true});var node=lookup.node;var readdir=FS.checkOpExists(node.node_ops.readdir,54);return readdir(node)},unlink(path){var lookup=FS.lookupPath(path,{parent:true});var parent=lookup.node;if(!parent){throw new FS.ErrnoError(44)}var name=PATH.basename(path);var node=FS.lookupNode(parent,name);var errCode=FS.mayDelete(parent,name,false);if(errCode){throw new FS.ErrnoError(errCode)}if(!parent.node_ops.unlink){throw new FS.ErrnoError(63)}if(FS.isMountpoint(node)){throw new FS.ErrnoError(10)}parent.node_ops.unlink(parent,name);FS.destroyNode(node)},readlink(path){var lookup=FS.lookupPath(path);var link=lookup.node;if(!link){throw new FS.ErrnoError(44)}if(!link.node_ops.readlink){throw new FS.ErrnoError(28)}return link.node_ops.readlink(link)},stat(path,dontFollow){var lookup=FS.lookupPath(path,{follow:!dontFollow});var node=lookup.node;var getattr=FS.checkOpExists(node.node_ops.getattr,63);return getattr(node)},fstat(fd){var stream=FS.getStreamChecked(fd);var node=stream.node;var getattr=stream.stream_ops.getattr;var arg=getattr?stream:node;getattr??=node.node_ops.getattr;FS.checkOpExists(getattr,63);return getattr(arg)},lstat(path){return FS.stat(path,true)},doChmod(stream,node,mode,dontFollow){FS.doSetAttr(stream,node,{mode:mode&4095|node.mode&~4095,ctime:Date.now(),dontFollow})},chmod(path,mode,dontFollow){var node;if(typeof path==\"string\"){var lookup=FS.lookupPath(path,{follow:!dontFollow});node=lookup.node}else{node=path}FS.doChmod(null,node,mode,dontFollow)},lchmod(path,mode){FS.chmod(path,mode,true)},fchmod(fd,mode){var stream=FS.getStreamChecked(fd);FS.doChmod(stream,stream.node,mode,false)},doChown(stream,node,dontFollow){FS.doSetAttr(stream,node,{timestamp:Date.now(),dontFollow})},chown(path,uid,gid,dontFollow){var node;if(typeof path==\"string\"){var lookup=FS.lookupPath(path,{follow:!dontFollow});node=lookup.node}else{node=path}FS.doChown(null,node,dontFollow)},lchown(path,uid,gid){FS.chown(path,uid,gid,true)},fchown(fd,uid,gid){var stream=FS.getStreamChecked(fd);FS.doChown(stream,stream.node,false)},doTruncate(stream,node,len){if(FS.isDir(node.mode)){throw new FS.ErrnoError(31)}if(!FS.isFile(node.mode)){throw new FS.ErrnoError(28)}var errCode=FS.nodePermissions(node,\"w\");if(errCode){throw new FS.ErrnoError(errCode)}FS.doSetAttr(stream,node,{size:len,timestamp:Date.now()})},truncate(path,len){if(len<0){throw new FS.ErrnoError(28)}var node;if(typeof path==\"string\"){var lookup=FS.lookupPath(path,{follow:true});node=lookup.node}else{node=path}FS.doTruncate(null,node,len)},ftruncate(fd,len){var stream=FS.getStreamChecked(fd);if(len<0||(stream.flags&2097155)===0){throw new FS.ErrnoError(28)}FS.doTruncate(stream,stream.node,len)},utime(path,atime,mtime){var lookup=FS.lookupPath(path,{follow:true});var node=lookup.node;var setattr=FS.checkOpExists(node.node_ops.setattr,63);setattr(node,{atime,mtime})},open(path,flags,mode=438){if(path===\"\"){throw new FS.ErrnoError(44)}flags=typeof flags==\"string\"?FS_modeStringToFlags(flags):flags;if(flags&64){mode=mode&4095|32768}else{mode=0}var node;var isDirPath;if(typeof path==\"object\"){node=path}else{isDirPath=path.endsWith(\"/\");var lookup=FS.lookupPath(path,{follow:!(flags&131072),noent_okay:true});node=lookup.node;path=lookup.path}var created=false;if(flags&64){if(node){if(flags&128){throw new FS.ErrnoError(20)}}else if(isDirPath){throw new FS.ErrnoError(31)}else{node=FS.mknod(path,mode|511,0);created=true}}if(!node){throw new FS.ErrnoError(44)}if(FS.isChrdev(node.mode)){flags&=~512}if(flags&65536&&!FS.isDir(node.mode)){throw new FS.ErrnoError(54)}if(!created){var errCode=FS.mayOpen(node,flags);if(errCode){throw new FS.ErrnoError(errCode)}}if(flags&512&&!created){FS.truncate(node,0)}flags&=~(128|512|131072);var stream=FS.createStream({node,path:FS.getPath(node),flags,seekable:true,position:0,stream_ops:node.stream_ops,ungotten:[],error:false});if(stream.stream_ops.open){stream.stream_ops.open(stream)}if(created){FS.chmod(node,mode&511)}if(Module[\"logReadFiles\"]&&!(flags&1)){if(!(path in FS.readFiles)){FS.readFiles[path]=1}}return stream},close(stream){if(FS.isClosed(stream)){throw new FS.ErrnoError(8)}if(stream.getdents)stream.getdents=null;try{if(stream.stream_ops.close){stream.stream_ops.close(stream)}}catch(e){throw e}finally{FS.closeStream(stream.fd)}stream.fd=null},isClosed(stream){return stream.fd===null},llseek(stream,offset,whence){if(FS.isClosed(stream)){throw new FS.ErrnoError(8)}if(!stream.seekable||!stream.stream_ops.llseek){throw new FS.ErrnoError(70)}if(whence!=0&&whence!=1&&whence!=2){throw new FS.ErrnoError(28)}stream.position=stream.stream_ops.llseek(stream,offset,whence);stream.ungotten=[];return stream.position},read(stream,buffer,offset,length,position){if(length<0||position<0){throw new FS.ErrnoError(28)}if(FS.isClosed(stream)){throw new FS.ErrnoError(8)}if((stream.flags&2097155)===1){throw new FS.ErrnoError(8)}if(FS.isDir(stream.node.mode)){throw new FS.ErrnoError(31)}if(!stream.stream_ops.read){throw new FS.ErrnoError(28)}var seeking=typeof position!=\"undefined\";if(!seeking){position=stream.position}else if(!stream.seekable){throw new FS.ErrnoError(70)}var bytesRead=stream.stream_ops.read(stream,buffer,offset,length,position);if(!seeking)stream.position+=bytesRead;return bytesRead},write(stream,buffer,offset,length,position,canOwn){if(length<0||position<0){throw new FS.ErrnoError(28)}if(FS.isClosed(stream)){throw new FS.ErrnoError(8)}if((stream.flags&2097155)===0){throw new FS.ErrnoError(8)}if(FS.isDir(stream.node.mode)){throw new FS.ErrnoError(31)}if(!stream.stream_ops.write){throw new FS.ErrnoError(28)}if(stream.seekable&&stream.flags&1024){FS.llseek(stream,0,2)}var seeking=typeof position!=\"undefined\";if(!seeking){position=stream.position}else if(!stream.seekable){throw new FS.ErrnoError(70)}var bytesWritten=stream.stream_ops.write(stream,buffer,offset,length,position,canOwn);if(!seeking)stream.position+=bytesWritten;return bytesWritten},mmap(stream,length,position,prot,flags){if((prot&2)!==0&&(flags&2)===0&&(stream.flags&2097155)!==2){throw new FS.ErrnoError(2)}if((stream.flags&2097155)===1){throw new FS.ErrnoError(2)}if(!stream.stream_ops.mmap){throw new FS.ErrnoError(43)}if(!length){throw new FS.ErrnoError(28)}return stream.stream_ops.mmap(stream,length,position,prot,flags)},msync(stream,buffer,offset,length,mmapFlags){if(!stream.stream_ops.msync){return 0}return stream.stream_ops.msync(stream,buffer,offset,length,mmapFlags)},ioctl(stream,cmd,arg){if(!stream.stream_ops.ioctl){throw new FS.ErrnoError(59)}return stream.stream_ops.ioctl(stream,cmd,arg)},readFile(path,opts={}){opts.flags=opts.flags||0;opts.encoding=opts.encoding||\"binary\";if(opts.encoding!==\"utf8\"&&opts.encoding!==\"binary\"){abort(`Invalid encoding type \"${opts.encoding}\"`)}var stream=FS.open(path,opts.flags);var stat=FS.stat(path);var length=stat.size;var buf=new Uint8Array(length);FS.read(stream,buf,0,length,0);if(opts.encoding===\"utf8\"){buf=UTF8ArrayToString(buf)}FS.close(stream);return buf},writeFile(path,data,opts={}){opts.flags=opts.flags||577;var stream=FS.open(path,opts.flags,opts.mode);if(typeof data==\"string\"){data=new Uint8Array(intArrayFromString(data,true))}if(ArrayBuffer.isView(data)){FS.write(stream,data,0,data.byteLength,undefined,opts.canOwn)}else{abort(\"Unsupported data type\")}FS.close(stream)},cwd:()=>FS.currentPath,chdir(path){var lookup=FS.lookupPath(path,{follow:true});if(lookup.node===null){throw new FS.ErrnoError(44)}if(!FS.isDir(lookup.node.mode)){throw new FS.ErrnoError(54)}var errCode=FS.nodePermissions(lookup.node,\"x\");if(errCode){throw new FS.ErrnoError(errCode)}FS.currentPath=lookup.path},createDefaultDirectories(){FS.mkdir(\"/tmp\");FS.mkdir(\"/home\");FS.mkdir(\"/home/web_user\")},createDefaultDevices(){FS.mkdir(\"/dev\");FS.registerDevice(FS.makedev(1,3),{read:()=>0,write:(stream,buffer,offset,length,pos)=>length,llseek:()=>0});FS.mkdev(\"/dev/null\",FS.makedev(1,3));TTY.register(FS.makedev(5,0),TTY.default_tty_ops);TTY.register(FS.makedev(6,0),TTY.default_tty1_ops);FS.mkdev(\"/dev/tty\",FS.makedev(5,0));FS.mkdev(\"/dev/tty1\",FS.makedev(6,0));var randomBuffer=new Uint8Array(1024),randomLeft=0;var randomByte=()=>{if(randomLeft===0){randomFill(randomBuffer);randomLeft=randomBuffer.byteLength}return randomBuffer[--randomLeft]};FS.createDevice(\"/dev\",\"random\",randomByte);FS.createDevice(\"/dev\",\"urandom\",randomByte);FS.mkdir(\"/dev/shm\");FS.mkdir(\"/dev/shm/tmp\")},createSpecialDirectories(){FS.mkdir(\"/proc\");var proc_self=FS.mkdir(\"/proc/self\");FS.mkdir(\"/proc/self/fd\");FS.mount({mount(){var node=FS.createNode(proc_self,\"fd\",16895,73);node.stream_ops={llseek:MEMFS.stream_ops.llseek};node.node_ops={lookup(parent,name){var fd=+name;var stream=FS.getStreamChecked(fd);var ret={parent:null,mount:{mountpoint:\"fake\"},node_ops:{readlink:()=>stream.path},id:fd+1};ret.parent=ret;return ret},readdir(){return Array.from(FS.streams.entries()).filter(([k,v])=>v).map(([k,v])=>k.toString())}};return node}},{},\"/proc/self/fd\")},createStandardStreams(input,output,error){if(input){FS.createDevice(\"/dev\",\"stdin\",input)}else{FS.symlink(\"/dev/tty\",\"/dev/stdin\")}if(output){FS.createDevice(\"/dev\",\"stdout\",null,output)}else{FS.symlink(\"/dev/tty\",\"/dev/stdout\")}if(error){FS.createDevice(\"/dev\",\"stderr\",null,error)}else{FS.symlink(\"/dev/tty1\",\"/dev/stderr\")}var stdin=FS.open(\"/dev/stdin\",0);var stdout=FS.open(\"/dev/stdout\",1);var stderr=FS.open(\"/dev/stderr\",1)},staticInit(){FS.nameTable=new Array(4096);FS.mount(MEMFS,{},\"/\");FS.createDefaultDirectories();FS.createDefaultDevices();FS.createSpecialDirectories();FS.filesystems={MEMFS}},init(input,output,error){FS.initialized=true;input??=Module[\"stdin\"];output??=Module[\"stdout\"];error??=Module[\"stderr\"];FS.createStandardStreams(input,output,error)},quit(){FS.initialized=false;for(var stream of FS.streams){if(stream){FS.close(stream)}}},findObject(path,dontResolveLastLink){var ret=FS.analyzePath(path,dontResolveLastLink);if(!ret.exists){return null}return ret.object},analyzePath(path,dontResolveLastLink){try{var lookup=FS.lookupPath(path,{follow:!dontResolveLastLink});path=lookup.path}catch(e){}var ret={isRoot:false,exists:false,error:0,name:null,path:null,object:null,parentExists:false,parentPath:null,parentObject:null};try{var lookup=FS.lookupPath(path,{parent:true});ret.parentExists=true;ret.parentPath=lookup.path;ret.parentObject=lookup.node;ret.name=PATH.basename(path);lookup=FS.lookupPath(path,{follow:!dontResolveLastLink});ret.exists=true;ret.path=lookup.path;ret.object=lookup.node;ret.name=lookup.node.name;ret.isRoot=lookup.path===\"/\"}catch(e){ret.error=e.errno}return ret},createPath(parent,path,canRead,canWrite){parent=typeof parent==\"string\"?parent:FS.getPath(parent);var parts=path.split(\"/\").reverse();while(parts.length){var part=parts.pop();if(!part)continue;var current=PATH.join2(parent,part);try{FS.mkdir(current)}catch(e){if(e.errno!=20)throw e}parent=current}return current},createFile(parent,name,properties,canRead,canWrite){var path=PATH.join2(typeof parent==\"string\"?parent:FS.getPath(parent),name);var mode=FS_getMode(canRead,canWrite);return FS.create(path,mode)},createDataFile(parent,name,data,canRead,canWrite,canOwn){var path=name;if(parent){parent=typeof parent==\"string\"?parent:FS.getPath(parent);path=name?PATH.join2(parent,name):parent}var mode=FS_getMode(canRead,canWrite);var node=FS.create(path,mode);if(data){if(typeof data==\"string\"){var arr=new Array(data.length);for(var i=0,len=data.length;i<len;++i)arr[i]=data.charCodeAt(i);data=arr}FS.chmod(node,mode|146);var stream=FS.open(node,577);FS.write(stream,data,0,data.length,0,canOwn);FS.close(stream);FS.chmod(node,mode)}},createDevice(parent,name,input,output){var path=PATH.join2(typeof parent==\"string\"?parent:FS.getPath(parent),name);var mode=FS_getMode(!!input,!!output);FS.createDevice.major??=64;var dev=FS.makedev(FS.createDevice.major++,0);FS.registerDevice(dev,{open(stream){stream.seekable=false},close(stream){if(output?.buffer?.length){output(10)}},read(stream,buffer,offset,length,pos){var bytesRead=0;for(var i=0;i<length;i++){var result;try{result=input()}catch(e){throw new FS.ErrnoError(29)}if(result===undefined&&bytesRead===0){throw new FS.ErrnoError(6)}if(result===null||result===undefined)break;bytesRead++;buffer[offset+i]=result}if(bytesRead){stream.node.atime=Date.now()}return bytesRead},write(stream,buffer,offset,length,pos){for(var i=0;i<length;i++){try{output(buffer[offset+i])}catch(e){throw new FS.ErrnoError(29)}}if(length){stream.node.mtime=stream.node.ctime=Date.now()}return i}});return FS.mkdev(path,mode,dev)},forceLoadFile(obj){if(obj.isDevice||obj.isFolder||obj.link||obj.contents)return true;if(globalThis.XMLHttpRequest){abort(\"Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.\")}else{try{obj.contents=readBinary(obj.url)}catch(e){throw new FS.ErrnoError(29)}}},createLazyFile(parent,name,url,canRead,canWrite){class LazyUint8Array{lengthKnown=false;chunks=[];get(idx){if(idx>this.length-1||idx<0){return undefined}var chunkOffset=idx%this.chunkSize;var chunkNum=idx/this.chunkSize|0;return this.getter(chunkNum)[chunkOffset]}setDataGetter(getter){this.getter=getter}cacheLength(){var xhr=new XMLHttpRequest;xhr.open(\"HEAD\",url,false);xhr.send(null);if(!(xhr.status>=200&&xhr.status<300||xhr.status===304))abort(\"Couldn't load \"+url+\". Status: \"+xhr.status);var datalength=Number(xhr.getResponseHeader(\"Content-length\"));var header;var hasByteServing=(header=xhr.getResponseHeader(\"Accept-Ranges\"))&&header===\"bytes\";var usesGzip=(header=xhr.getResponseHeader(\"Content-Encoding\"))&&header===\"gzip\";var chunkSize=1024*1024;if(!hasByteServing)chunkSize=datalength;var doXHR=(from,to)=>{if(from>to)abort(\"invalid range (\"+from+\", \"+to+\") or no bytes requested!\");if(to>datalength-1)abort(\"only \"+datalength+\" bytes available! programmer error!\");var xhr=new XMLHttpRequest;xhr.open(\"GET\",url,false);if(datalength!==chunkSize)xhr.setRequestHeader(\"Range\",\"bytes=\"+from+\"-\"+to);xhr.responseType=\"arraybuffer\";if(xhr.overrideMimeType){xhr.overrideMimeType(\"text/plain; charset=x-user-defined\")}xhr.send(null);if(!(xhr.status>=200&&xhr.status<300||xhr.status===304))abort(\"Couldn't load \"+url+\". Status: \"+xhr.status);if(xhr.response!==undefined){return new Uint8Array(xhr.response||[])}return intArrayFromString(xhr.responseText||\"\",true)};var lazyArray=this;lazyArray.setDataGetter(chunkNum=>{var start=chunkNum*chunkSize;var end=(chunkNum+1)*chunkSize-1;end=Math.min(end,datalength-1);if(typeof lazyArray.chunks[chunkNum]==\"undefined\"){lazyArray.chunks[chunkNum]=doXHR(start,end)}if(typeof lazyArray.chunks[chunkNum]==\"undefined\")abort(\"doXHR failed!\");return lazyArray.chunks[chunkNum]});if(usesGzip||!datalength){chunkSize=datalength=1;datalength=this.getter(0).length;chunkSize=datalength;out(\"LazyFiles on gzip forces download of the whole file when length is accessed\")}this._length=datalength;this._chunkSize=chunkSize;this.lengthKnown=true}get length(){if(!this.lengthKnown){this.cacheLength()}return this._length}get chunkSize(){if(!this.lengthKnown){this.cacheLength()}return this._chunkSize}}if(globalThis.XMLHttpRequest){if(!ENVIRONMENT_IS_WORKER)abort(\"Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc\");var lazyArray=new LazyUint8Array;var properties={isDevice:false,contents:lazyArray}}else{var properties={isDevice:false,url}}var node=FS.createFile(parent,name,properties,canRead,canWrite);if(properties.contents){node.contents=properties.contents}else if(properties.url){node.contents=null;node.url=properties.url}Object.defineProperties(node,{usedBytes:{get:function(){return this.contents.length}}});var stream_ops={};for(const[key,fn]of Object.entries(node.stream_ops)){stream_ops[key]=(...args)=>{FS.forceLoadFile(node);return fn(...args)}}function writeChunks(stream,buffer,offset,length,position){var contents=stream.node.contents;if(position>=contents.length)return 0;var size=Math.min(contents.length-position,length);if(contents.slice){for(var i=0;i<size;i++){buffer[offset+i]=contents[position+i]}}else{for(var i=0;i<size;i++){buffer[offset+i]=contents.get(position+i)}}return size}stream_ops.read=(stream,buffer,offset,length,position)=>{FS.forceLoadFile(node);return writeChunks(stream,buffer,offset,length,position)};stream_ops.mmap=(stream,length,position,prot,flags)=>{FS.forceLoadFile(node);var ptr=mmapAlloc(length);if(!ptr){throw new FS.ErrnoError(48)}writeChunks(stream,(growMemViews(),HEAP8),ptr,length,position);return{ptr,allocated:true}};node.stream_ops=stream_ops;return node}};var UTF8ToString=(ptr,maxBytesToRead,ignoreNul)=>ptr?UTF8ArrayToString((growMemViews(),HEAPU8),ptr,maxBytesToRead,ignoreNul):\"\";var SYSCALLS={DEFAULT_POLLMASK:5,calculateAt(dirfd,path,allowEmpty){if(PATH.isAbs(path)){return path}var dir;if(dirfd===-100){dir=FS.cwd()}else{var dirstream=SYSCALLS.getStreamFromFD(dirfd);dir=dirstream.path}if(path.length==0){if(!allowEmpty){throw new FS.ErrnoError(44)}return dir}return dir+\"/\"+path},writeStat(buf,stat){(growMemViews(),HEAPU32)[buf/4]=stat.dev;(growMemViews(),HEAPU32)[(buf+4)/4]=stat.mode;(growMemViews(),HEAPU64)[(buf+8)/8]=BigInt(stat.nlink);(growMemViews(),HEAPU32)[(buf+16)/4]=stat.uid;(growMemViews(),HEAPU32)[(buf+20)/4]=stat.gid;(growMemViews(),HEAPU32)[(buf+24)/4]=stat.rdev;(growMemViews(),HEAP64)[(buf+32)/8]=BigInt(stat.size);(growMemViews(),HEAP32)[(buf+40)/4]=4096;(growMemViews(),HEAP32)[(buf+44)/4]=stat.blocks;var atime=stat.atime.getTime();var mtime=stat.mtime.getTime();var ctime=stat.ctime.getTime();(growMemViews(),HEAP64)[(buf+48)/8]=BigInt(Math.floor(atime/1e3));(growMemViews(),HEAPU64)[(buf+56)/8]=BigInt(atime%1e3*1e3*1e3);(growMemViews(),HEAP64)[(buf+64)/8]=BigInt(Math.floor(mtime/1e3));(growMemViews(),HEAPU64)[(buf+72)/8]=BigInt(mtime%1e3*1e3*1e3);(growMemViews(),HEAP64)[(buf+80)/8]=BigInt(Math.floor(ctime/1e3));(growMemViews(),HEAPU64)[(buf+88)/8]=BigInt(ctime%1e3*1e3*1e3);(growMemViews(),HEAP64)[(buf+96)/8]=BigInt(stat.ino);return 0},writeStatFs(buf,stats){(growMemViews(),HEAPU32)[(buf+8)/4]=stats.bsize;(growMemViews(),HEAPU32)[(buf+72)/4]=stats.bsize;(growMemViews(),HEAP64)[(buf+16)/8]=BigInt(stats.blocks);(growMemViews(),HEAP64)[(buf+24)/8]=BigInt(stats.bfree);(growMemViews(),HEAP64)[(buf+32)/8]=BigInt(stats.bavail);(growMemViews(),HEAP64)[(buf+40)/8]=BigInt(stats.files);(growMemViews(),HEAP64)[(buf+48)/8]=BigInt(stats.ffree);(growMemViews(),HEAPU32)[(buf+56)/4]=stats.fsid;(growMemViews(),HEAPU32)[(buf+80)/4]=stats.flags;(growMemViews(),HEAPU32)[(buf+64)/4]=stats.namelen},doMsync(addr,stream,len,flags,offset){if(!FS.isFile(stream.node.mode)){throw new FS.ErrnoError(43)}if(flags&2){return 0}var buffer=(growMemViews(),HEAPU8).slice(addr,addr+len);FS.msync(stream,buffer,offset,len,flags)},getStreamFromFD(fd){var stream=FS.getStreamChecked(fd);return stream},varargs:undefined,getStr(ptr){var ret=UTF8ToString(ptr);return ret}};function ___syscall_fcntl64(fd,cmd,varargs){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(3,0,1,fd,cmd,varargs);varargs=bigintToI53Checked(varargs);SYSCALLS.varargs=varargs;try{var stream=SYSCALLS.getStreamFromFD(fd);switch(cmd){case 0:{var arg=syscallGetVarargI();if(arg<0){return-28}while(FS.streams[arg]){arg++}var newStream;newStream=FS.dupStream(stream,arg);return newStream.fd}case 1:case 2:return 0;case 3:return stream.flags;case 4:{var arg=syscallGetVarargI();stream.flags|=arg;return 0}case 5:{var arg=syscallGetVarargP();var offset=0;(growMemViews(),HEAP16)[(arg+offset)/2]=2;return 0}case 6:case 7:return 0}return-28}catch(e){if(typeof FS==\"undefined\"||!(e.name===\"ErrnoError\"))throw e;return-e.errno}}function ___syscall_fstat64(fd,buf){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(4,0,1,fd,buf);buf=bigintToI53Checked(buf);try{return SYSCALLS.writeStat(buf,FS.fstat(fd))}catch(e){if(typeof FS==\"undefined\"||!(e.name===\"ErrnoError\"))throw e;return-e.errno}}var stringToUTF8=(str,outPtr,maxBytesToWrite)=>stringToUTF8Array(str,(growMemViews(),HEAPU8),outPtr,maxBytesToWrite);function ___syscall_getcwd(buf,size){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(5,0,1,buf,size);buf=bigintToI53Checked(buf);size=bigintToI53Checked(size);try{if(size===0)return-28;var cwd=FS.cwd();var cwdLengthInBytes=lengthBytesUTF8(cwd)+1;if(size<cwdLengthInBytes)return-68;stringToUTF8(cwd,buf,size);return cwdLengthInBytes}catch(e){if(typeof FS==\"undefined\"||!(e.name===\"ErrnoError\"))throw e;return-e.errno}}function ___syscall_getdents64(fd,dirp,count){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(6,0,1,fd,dirp,count);dirp=bigintToI53Checked(dirp);count=bigintToI53Checked(count);try{var stream=SYSCALLS.getStreamFromFD(fd);stream.getdents||=FS.readdir(stream.path);var struct_size=280;var pos=0;var off=FS.llseek(stream,0,1);var startIdx=Math.floor(off/struct_size);var endIdx=Math.min(stream.getdents.length,startIdx+Math.floor(count/struct_size));for(var idx=startIdx;idx<endIdx;idx++){var id;var type;var name=stream.getdents[idx];if(name===\".\"){id=stream.node.id;type=4}else if(name===\"..\"){var lookup=FS.lookupPath(stream.path,{parent:true});id=lookup.node.id;type=4}else{var child;try{child=FS.lookupNode(stream.node,name)}catch(e){if(e?.errno===28){continue}throw e}id=child.id;type=FS.isChrdev(child.mode)?2:FS.isDir(child.mode)?4:FS.isLink(child.mode)?10:8}(growMemViews(),HEAP64)[(dirp+pos)/8]=BigInt(id);(growMemViews(),HEAP64)[(dirp+pos+8)/8]=BigInt((idx+1)*struct_size);(growMemViews(),HEAP16)[(dirp+pos+16)/2]=280;(growMemViews(),HEAP8)[dirp+pos+18]=type;stringToUTF8(name,dirp+pos+19,256);pos+=struct_size}FS.llseek(stream,idx*struct_size,0);return pos}catch(e){if(typeof FS==\"undefined\"||!(e.name===\"ErrnoError\"))throw e;return-e.errno}}function ___syscall_ioctl(fd,op,varargs){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(7,0,1,fd,op,varargs);varargs=bigintToI53Checked(varargs);SYSCALLS.varargs=varargs;try{var stream=SYSCALLS.getStreamFromFD(fd);switch(op){case 21509:{if(!stream.tty)return-59;return 0}case 21505:{if(!stream.tty)return-59;if(stream.tty.ops.ioctl_tcgets){var termios=stream.tty.ops.ioctl_tcgets(stream);var argp=syscallGetVarargP();(growMemViews(),HEAP32)[argp/4]=termios.c_iflag||0;(growMemViews(),HEAP32)[(argp+4)/4]=termios.c_oflag||0;(growMemViews(),HEAP32)[(argp+8)/4]=termios.c_cflag||0;(growMemViews(),HEAP32)[(argp+12)/4]=termios.c_lflag||0;for(var i=0;i<32;i++){(growMemViews(),HEAP8)[argp+i+17]=termios.c_cc[i]||0}return 0}return 0}case 21510:case 21511:case 21512:{if(!stream.tty)return-59;return 0}case 21506:case 21507:case 21508:{if(!stream.tty)return-59;if(stream.tty.ops.ioctl_tcsets){var argp=syscallGetVarargP();var c_iflag=(growMemViews(),HEAP32)[argp/4];var c_oflag=(growMemViews(),HEAP32)[(argp+4)/4];var c_cflag=(growMemViews(),HEAP32)[(argp+8)/4];var c_lflag=(growMemViews(),HEAP32)[(argp+12)/4];var c_cc=[];for(var i=0;i<32;i++){c_cc.push((growMemViews(),HEAP8)[argp+i+17])}return stream.tty.ops.ioctl_tcsets(stream.tty,op,{c_iflag,c_oflag,c_cflag,c_lflag,c_cc})}return 0}case 21519:{if(!stream.tty)return-59;var argp=syscallGetVarargP();(growMemViews(),HEAP32)[argp/4]=0;return 0}case 21520:{if(!stream.tty)return-59;return-28}case 21537:case 21531:{var argp=syscallGetVarargP();return FS.ioctl(stream,op,argp)}case 21523:{if(!stream.tty)return-59;if(stream.tty.ops.ioctl_tiocgwinsz){var winsize=stream.tty.ops.ioctl_tiocgwinsz(stream.tty);var argp=syscallGetVarargP();(growMemViews(),HEAP16)[argp/2]=winsize[0];(growMemViews(),HEAP16)[(argp+2)/2]=winsize[1]}return 0}case 21524:{if(!stream.tty)return-59;return 0}case 21515:{if(!stream.tty)return-59;return 0}default:return-28}}catch(e){if(typeof FS==\"undefined\"||!(e.name===\"ErrnoError\"))throw e;return-e.errno}}function ___syscall_lstat64(path,buf){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(8,0,1,path,buf);path=bigintToI53Checked(path);buf=bigintToI53Checked(buf);try{path=SYSCALLS.getStr(path);return SYSCALLS.writeStat(buf,FS.lstat(path))}catch(e){if(typeof FS==\"undefined\"||!(e.name===\"ErrnoError\"))throw e;return-e.errno}}function ___syscall_newfstatat(dirfd,path,buf,flags){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(9,0,1,dirfd,path,buf,flags);path=bigintToI53Checked(path);buf=bigintToI53Checked(buf);try{path=SYSCALLS.getStr(path);var nofollow=flags&256;var allowEmpty=flags&4096;flags=flags&~6400;path=SYSCALLS.calculateAt(dirfd,path,allowEmpty);return SYSCALLS.writeStat(buf,nofollow?FS.lstat(path):FS.stat(path))}catch(e){if(typeof FS==\"undefined\"||!(e.name===\"ErrnoError\"))throw e;return-e.errno}}function ___syscall_openat(dirfd,path,flags,varargs){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(10,0,1,dirfd,path,flags,varargs);path=bigintToI53Checked(path);varargs=bigintToI53Checked(varargs);SYSCALLS.varargs=varargs;try{path=SYSCALLS.getStr(path);path=SYSCALLS.calculateAt(dirfd,path);var mode=varargs?syscallGetVarargI():0;return FS.open(path,flags,mode).fd}catch(e){if(typeof FS==\"undefined\"||!(e.name===\"ErrnoError\"))throw e;return-e.errno}}function ___syscall_stat64(path,buf){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(11,0,1,path,buf);path=bigintToI53Checked(path);buf=bigintToI53Checked(buf);try{path=SYSCALLS.getStr(path);return SYSCALLS.writeStat(buf,FS.stat(path))}catch(e){if(typeof FS==\"undefined\"||!(e.name===\"ErrnoError\"))throw e;return-e.errno}}var __abort_js=()=>abort(\"\");function __emscripten_init_main_thread_js(tb){tb=bigintToI53Checked(tb);__emscripten_thread_init(tb,!ENVIRONMENT_IS_WORKER,1,!ENVIRONMENT_IS_WEB,5242880,false);PThread.threadInitTLS()}var handleException=e=>{if(e instanceof ExitStatus||e==\"unwind\"){return EXITSTATUS}quit_(1,e)};var maybeExit=()=>{if(!keepRuntimeAlive()){try{if(ENVIRONMENT_IS_PTHREAD){if(_pthread_self())__emscripten_thread_exit(EXITSTATUS);return}_exit(EXITSTATUS)}catch(e){handleException(e)}}};var callUserCallback=func=>{if(ABORT){return}try{func();maybeExit()}catch(e){handleException(e)}};function __emscripten_thread_mailbox_await(pthread_ptr){pthread_ptr=bigintToI53Checked(pthread_ptr);if(Atomics.waitAsync){var wait=Atomics.waitAsync((growMemViews(),HEAP32),pthread_ptr/4,pthread_ptr);wait.value.then(checkMailbox);var waitingAsync=pthread_ptr+228;Atomics.store((growMemViews(),HEAP32),waitingAsync/4,1)}}var checkMailbox=()=>callUserCallback(()=>{var pthread_ptr=_pthread_self();if(pthread_ptr){__emscripten_thread_mailbox_await(pthread_ptr);__emscripten_check_mailbox()}});function __emscripten_notify_mailbox_postmessage(targetThread,currThreadId){targetThread=bigintToI53Checked(targetThread);currThreadId=bigintToI53Checked(currThreadId);if(targetThread==currThreadId){setTimeout(checkMailbox)}else if(ENVIRONMENT_IS_PTHREAD){postMessage({targetThread,cmd:\"checkMailbox\"})}else{var worker=PThread.pthreads[targetThread];if(!worker){return}worker.postMessage({cmd:\"checkMailbox\"})}}var proxiedJSCallArgs=[];function __emscripten_receive_on_main_thread_js(funcIndex,emAsmAddr,callingThread,numCallArgs,args){emAsmAddr=bigintToI53Checked(emAsmAddr);callingThread=bigintToI53Checked(callingThread);args=bigintToI53Checked(args);numCallArgs/=2;proxiedJSCallArgs.length=numCallArgs;var b=args/8;for(var i=0;i<numCallArgs;i++){if((growMemViews(),HEAP64)[b+2*i]){proxiedJSCallArgs[i]=(growMemViews(),HEAP64)[b+2*i+1]}else{proxiedJSCallArgs[i]=(growMemViews(),HEAPF64)[b+2*i+1]}}var func=emAsmAddr?ASM_CONSTS[emAsmAddr]:proxiedFunctionTable[funcIndex];PThread.currentProxiedOperationCallerThread=callingThread;var rtn=func(...proxiedJSCallArgs);PThread.currentProxiedOperationCallerThread=0;if(typeof rtn==\"bigint\"){rtn=bigintToI53Checked(rtn)}return rtn}function __emscripten_thread_cleanup(thread){thread=bigintToI53Checked(thread);if(!ENVIRONMENT_IS_PTHREAD)cleanupThread(thread);else postMessage({cmd:\"cleanupThread\",thread})}function __emscripten_thread_set_strongref(thread){thread=bigintToI53Checked(thread);if(ENVIRONMENT_IS_NODE){PThread.pthreads[thread].ref()}}var isLeapYear=year=>year%4===0&&(year%100!==0||year%400===0);var MONTH_DAYS_LEAP_CUMULATIVE=[0,31,60,91,121,152,182,213,244,274,305,335];var MONTH_DAYS_REGULAR_CUMULATIVE=[0,31,59,90,120,151,181,212,243,273,304,334];var ydayFromDate=date=>{var leap=isLeapYear(date.getFullYear());var monthDaysCumulative=leap?MONTH_DAYS_LEAP_CUMULATIVE:MONTH_DAYS_REGULAR_CUMULATIVE;var yday=monthDaysCumulative[date.getMonth()]+date.getDate()-1;return yday};function __localtime_js(time,tmPtr){time=bigintToI53Checked(time);tmPtr=bigintToI53Checked(tmPtr);var date=new Date(time*1e3);(growMemViews(),HEAP32)[tmPtr/4]=date.getSeconds();(growMemViews(),HEAP32)[(tmPtr+4)/4]=date.getMinutes();(growMemViews(),HEAP32)[(tmPtr+8)/4]=date.getHours();(growMemViews(),HEAP32)[(tmPtr+12)/4]=date.getDate();(growMemViews(),HEAP32)[(tmPtr+16)/4]=date.getMonth();(growMemViews(),HEAP32)[(tmPtr+20)/4]=date.getFullYear()-1900;(growMemViews(),HEAP32)[(tmPtr+24)/4]=date.getDay();var yday=ydayFromDate(date)|0;(growMemViews(),HEAP32)[(tmPtr+28)/4]=yday;(growMemViews(),HEAP64)[(tmPtr+40)/8]=BigInt(-(date.getTimezoneOffset()*60));var start=new Date(date.getFullYear(),0,1);var summerOffset=new Date(date.getFullYear(),6,1).getTimezoneOffset();var winterOffset=start.getTimezoneOffset();var dst=(summerOffset!=winterOffset&&date.getTimezoneOffset()==Math.min(winterOffset,summerOffset))|0;(growMemViews(),HEAP32)[(tmPtr+32)/4]=dst}function __mmap_js(len,prot,flags,fd,offset,allocated,addr){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(12,0,1,len,prot,flags,fd,offset,allocated,addr);len=bigintToI53Checked(len);offset=bigintToI53Checked(offset);allocated=bigintToI53Checked(allocated);addr=bigintToI53Checked(addr);try{var stream=SYSCALLS.getStreamFromFD(fd);var res=FS.mmap(stream,len,offset,prot,flags);var ptr=res.ptr;(growMemViews(),HEAP32)[allocated/4]=res.allocated;(growMemViews(),HEAPU64)[addr/8]=BigInt(ptr);return 0}catch(e){if(typeof FS==\"undefined\"||!(e.name===\"ErrnoError\"))throw e;return-e.errno}}function __munmap_js(addr,len,prot,flags,fd,offset){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(13,0,1,addr,len,prot,flags,fd,offset);addr=bigintToI53Checked(addr);len=bigintToI53Checked(len);offset=bigintToI53Checked(offset);try{var stream=SYSCALLS.getStreamFromFD(fd);if(prot&2){SYSCALLS.doMsync(addr,stream,len,flags,offset)}}catch(e){if(typeof FS==\"undefined\"||!(e.name===\"ErrnoError\"))throw e;return-e.errno}}var __tzset_js=function(timezone,daylight,std_name,dst_name){timezone=bigintToI53Checked(timezone);daylight=bigintToI53Checked(daylight);std_name=bigintToI53Checked(std_name);dst_name=bigintToI53Checked(dst_name);var currentYear=(new Date).getFullYear();var winter=new Date(currentYear,0,1);var summer=new Date(currentYear,6,1);var winterOffset=winter.getTimezoneOffset();var summerOffset=summer.getTimezoneOffset();var stdTimezoneOffset=Math.max(winterOffset,summerOffset);(growMemViews(),HEAPU64)[timezone/8]=BigInt(stdTimezoneOffset*60);(growMemViews(),HEAP32)[daylight/4]=Number(winterOffset!=summerOffset);var extractZone=timezoneOffset=>{var sign=timezoneOffset>=0?\"-\":\"+\";var absOffset=Math.abs(timezoneOffset);var hours=String(Math.floor(absOffset/60)).padStart(2,\"0\");var minutes=String(absOffset%60).padStart(2,\"0\");return`UTC${sign}${hours}${minutes}`};var winterName=extractZone(winterOffset);var summerName=extractZone(summerOffset);if(summerOffset<winterOffset){stringToUTF8(winterName,std_name,17);stringToUTF8(summerName,dst_name,17)}else{stringToUTF8(winterName,dst_name,17);stringToUTF8(summerName,std_name,17)}};var _emscripten_get_now=()=>performance.timeOrigin+performance.now();var _emscripten_date_now=()=>Date.now();var nowIsMonotonic=1;var checkWasiClock=clock_id=>clock_id>=0&&clock_id<=3;function _clock_time_get(clk_id,ignored_precision,ptime){ignored_precision=bigintToI53Checked(ignored_precision);ptime=bigintToI53Checked(ptime);if(!checkWasiClock(clk_id)){return 28}var now;if(clk_id===0){now=_emscripten_date_now()}else if(nowIsMonotonic){now=_emscripten_get_now()}else{return 52}var nsec=Math.round(now*1e3*1e3);(growMemViews(),HEAP64)[ptime/8]=BigInt(nsec);return 0}var readEmAsmArgsArray=[];var readEmAsmArgs=(sigPtr,buf)=>{readEmAsmArgsArray.length=0;var ch;while(ch=(growMemViews(),HEAPU8)[sigPtr++]){var wide=ch!=105;buf+=wide&&buf%8?4:0;readEmAsmArgsArray.push(ch==112?Number((growMemViews(),HEAPU64)[buf/8]):ch==106?(growMemViews(),HEAP64)[buf/8]:ch==105?(growMemViews(),HEAP32)[buf/4]:(growMemViews(),HEAPF64)[buf/8]);buf+=wide?8:4}return readEmAsmArgsArray};var runEmAsmFunction=(code,sigPtr,argbuf)=>{var args=readEmAsmArgs(sigPtr,argbuf);return ASM_CONSTS[code](...args)};function _emscripten_asm_const_double(code,sigPtr,argbuf){code=bigintToI53Checked(code);sigPtr=bigintToI53Checked(sigPtr);argbuf=bigintToI53Checked(argbuf);return runEmAsmFunction(code,sigPtr,argbuf)}var _emscripten_check_blocking_allowed=()=>{};var runtimeKeepalivePush=()=>{runtimeKeepaliveCounter+=1};var _emscripten_exit_with_live_runtime=()=>{runtimeKeepalivePush();throw\"unwind\"};var jsStackTrace=()=>(new Error).stack.toString();var getCallstack=flags=>{var callstack=jsStackTrace();var lines=callstack.split(\"\\n\");callstack=\"\";var firefoxRe=new RegExp(\"\\\\s*(.*?)@(.*?):([0-9]+):([0-9]+)\");var chromeRe=new RegExp(\"\\\\s*at (.*?) \\\\((.*):(.*):(.*)\\\\)\");for(var line of lines){var symbolName=\"\";var file=\"\";var lineno=0;var column=0;var parts=chromeRe.exec(line);if(parts?.length==5){symbolName=parts[1];file=parts[2];lineno=parts[3];column=parts[4]}else{parts=firefoxRe.exec(line);if(parts?.length>=4){symbolName=parts[1];file=parts[2];lineno=parts[3];column=parts[4]|0}else{callstack+=line+\"\\n\";continue}}if(symbolName==\"_emscripten_log\"||symbolName==\"_emscripten_get_callstack\"){callstack=\"\";continue}if(flags&24){if(flags&64){file=file.substring(file.replace(/\\\\/g,\"/\").lastIndexOf(\"/\")+1)}callstack+=`    at ${symbolName} (${file}:${lineno}:${column})\\n`}}callstack=callstack.replace(/\\s+$/,\"\");return callstack};function _emscripten_get_callstack(flags,str,maxbytes){str=bigintToI53Checked(str);var callstack=getCallstack(flags);if(!str||maxbytes<=0){return lengthBytesUTF8(callstack)+1}var bytesWrittenExcludingNull=stringToUTF8(callstack,str,maxbytes);return bytesWrittenExcludingNull+1}var getHeapMax=()=>4294967296;var _emscripten_get_heap_max=()=>BigInt(getHeapMax());var _emscripten_has_asyncify=()=>2;var _emscripten_num_logical_cores=()=>ENVIRONMENT_IS_NODE?require(\"os\").cpus().length:navigator[\"hardwareConcurrency\"];var growMemory=size=>{var oldHeapSize=wasmMemory.buffer.byteLength;var pages=(size-oldHeapSize+65535)/65536|0;try{wasmMemory.grow(BigInt(pages));updateMemoryViews();return 1}catch(e){}};function _emscripten_resize_heap(requestedSize){if(self.__flight_wrapGrow)return self.__flight_wrapGrow(__st_resize_orig,requestedSize);return __st_resize_orig(requestedSize)}function __st_resize_orig(requestedSize){requestedSize=bigintToI53Checked(requestedSize);var oldSize=(growMemViews(),HEAPU8).length;if(requestedSize<=oldSize){return false}var maxHeapSize=getHeapMax();if(requestedSize>maxHeapSize){return false}for(var cutDown=1;cutDown<=4;cutDown*=2){var overGrownHeapSize=oldSize*(1+.2/cutDown);overGrownHeapSize=Math.min(overGrownHeapSize,requestedSize+100663296);var newSize=Math.min(maxHeapSize,alignMemory(Math.max(requestedSize,overGrownHeapSize),65536));var replacement=growMemory(newSize);if(replacement){return true}}return false}var stringToUTF8OnStack=str=>{var size=lengthBytesUTF8(str)+1;var ret=stackAlloc(size);stringToUTF8(str,ret,size);return ret};var writeI53ToI64=(ptr,num)=>{(growMemViews(),HEAPU32)[ptr/4]=num;var lower=(growMemViews(),HEAPU32)[ptr/4];(growMemViews(),HEAPU32)[(ptr+4)/4]=(num-lower)/4294967296};var stringToNewUTF8=str=>{var size=lengthBytesUTF8(str)+1;var ret=_malloc(size);if(ret)stringToUTF8(str,ret,size);return ret};var readI53FromI64=ptr=>(growMemViews(),HEAPU32)[ptr/4]+(growMemViews(),HEAP32)[(ptr+4)/4]*4294967296;var WebGPU={Internals:{jsObjects:[],jsObjectInsert:(ptr,jsObject)=>{WebGPU.Internals.jsObjects[ptr]=jsObject},bufferOnUnmaps:[],futures:[],futureInsert:(futureId,promise)=>{WebGPU.Internals.futures[futureId]=new Promise(resolve=>promise.finally(()=>resolve(futureId)))}},getJsObject:ptr=>{if(!ptr)return undefined;return WebGPU.Internals.jsObjects[ptr]},importJsAdapter:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateAdapter(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsBindGroup:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateBindGroup(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsBindGroupLayout:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateBindGroupLayout(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsBuffer:(buffer,parentPtr=0)=>{assert(buffer.mapState===\"unmapped\");var bufferPtr=_emwgpuCreateBuffer(parentPtr);WebGPU.Internals.jsObjectInsert(bufferPtr,buffer);return bufferPtr},importJsCommandBuffer:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateCommandBuffer(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsCommandEncoder:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateCommandEncoder(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsComputePassEncoder:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateComputePassEncoder(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsComputePipeline:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateComputePipeline(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsDevice:(device,parentPtr=0)=>{var queuePtr=_emwgpuCreateQueue(parentPtr);var devicePtr=_emwgpuCreateDevice(parentPtr,queuePtr);WebGPU.Internals.jsObjectInsert(queuePtr,device.queue);WebGPU.Internals.jsObjectInsert(devicePtr,device);return devicePtr},importJsExternalTexture:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateExternalTexture(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsPipelineLayout:(obj,parentPtr=0)=>{var ptr=_emwgpuCreatePipelineLayout(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsQuerySet:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateQuerySet(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsQueue:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateQueue(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsRenderBundle:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateRenderBundle(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsRenderBundleEncoder:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateRenderBundleEncoder(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsRenderPassEncoder:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateRenderPassEncoder(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsRenderPipeline:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateRenderPipeline(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsSampler:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateSampler(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsShaderModule:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateShaderModule(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsSurface:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateSurface(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsTexture:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateTexture(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsTextureView:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateTextureView(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},errorCallback:(callback,type,message,userdata)=>{var sp=stackSave();var messagePtr=stringToUTF8OnStack(message);((a1,a2,a3)=>getWasmTableEntry(callback).call(null,a1,BigInt(a2),BigInt(a3)))(type,BigInt(messagePtr),userdata);stackRestore(sp)},iterateExtensions:(root,handlers)=>{for(var ptr=Number((growMemViews(),HEAPU64)[root/8]);ptr;ptr=Number((growMemViews(),HEAPU64)[ptr/8])){var sType=(growMemViews(),HEAP32)[(ptr+8)/4];var handler=handlers[sType](ptr)}},setStringView:(ptr,data,length)=>{(growMemViews(),HEAPU64)[ptr/8]=BigInt(data);(growMemViews(),HEAPU64)[(ptr+8)/8]=BigInt(length)},makeStringFromStringView:stringViewPtr=>{var ptr=Number((growMemViews(),HEAPU64)[stringViewPtr/8]);var length=Number((growMemViews(),HEAPU64)[(stringViewPtr+8)/8]);return UTF8ToString(ptr,length)},makeStringFromOptionalStringView:stringViewPtr=>{var ptr=Number((growMemViews(),HEAPU64)[stringViewPtr/8]);var length=Number((growMemViews(),HEAPU64)[(stringViewPtr+8)/8]);if(!ptr){if(length===0){return\"\"}return undefined}return UTF8ToString(ptr,length)},makeColor:ptr=>({r:(growMemViews(),HEAPF64)[ptr/8],g:(growMemViews(),HEAPF64)[(ptr+8)/8],b:(growMemViews(),HEAPF64)[(ptr+16)/8],a:(growMemViews(),HEAPF64)[(ptr+24)/8]}),makeExtent3D:ptr=>({width:(growMemViews(),HEAPU32)[ptr/4],height:(growMemViews(),HEAPU32)[(ptr+4)/4],depthOrArrayLayers:(growMemViews(),HEAPU32)[(ptr+8)/4]}),makeOrigin3D:ptr=>({x:(growMemViews(),HEAPU32)[ptr/4],y:(growMemViews(),HEAPU32)[(ptr+4)/4],z:(growMemViews(),HEAPU32)[(ptr+8)/4]}),makeTexelCopyTextureInfo:ptr=>({texture:WebGPU.getJsObject(Number((growMemViews(),HEAPU64)[ptr/8])),mipLevel:(growMemViews(),HEAPU32)[(ptr+8)/4],origin:WebGPU.makeOrigin3D(ptr+12),aspect:WebGPU.TextureAspect[(growMemViews(),HEAP32)[(ptr+24)/4]]}),makeTexelCopyBufferLayout:ptr=>{var bytesPerRow=(growMemViews(),HEAPU32)[(ptr+8)/4];var rowsPerImage=(growMemViews(),HEAPU32)[(ptr+12)/4];return{offset:readI53FromI64(ptr),bytesPerRow:bytesPerRow===4294967295?undefined:bytesPerRow,rowsPerImage:rowsPerImage===4294967295?undefined:rowsPerImage}},makeTexelCopyBufferInfo:ptr=>{var layoutPtr=ptr+0;var bufferCopyView=WebGPU.makeTexelCopyBufferLayout(layoutPtr);bufferCopyView[\"buffer\"]=WebGPU.getJsObject(Number((growMemViews(),HEAPU64)[(ptr+16)/8]));return bufferCopyView},makePassTimestampWrites:ptr=>{if(ptr===0)return undefined;return{querySet:WebGPU.getJsObject(Number((growMemViews(),HEAPU64)[(ptr+8)/8])),beginningOfPassWriteIndex:(growMemViews(),HEAPU32)[(ptr+16)/4],endOfPassWriteIndex:(growMemViews(),HEAPU32)[(ptr+20)/4]}},makePipelineConstants:(constantCount,constantsPtr)=>{if(!constantCount)return;var constants={};for(var i=0;i<constantCount;++i){var entryPtr=constantsPtr+32*i;var key=WebGPU.makeStringFromStringView(entryPtr+8);constants[key]=(growMemViews(),HEAPF64)[(entryPtr+24)/8]}return constants},makePipelineLayout:layoutPtr=>{if(!layoutPtr)return\"auto\";return WebGPU.getJsObject(layoutPtr)},makeComputeState:ptr=>{if(!ptr)return undefined;var desc={module:WebGPU.getJsObject(Number((growMemViews(),HEAPU64)[(ptr+8)/8])),constants:WebGPU.makePipelineConstants(Number((growMemViews(),HEAPU64)[(ptr+32)/8]),Number((growMemViews(),HEAPU64)[(ptr+40)/8])),entryPoint:WebGPU.makeStringFromOptionalStringView(ptr+16)};return desc},makeComputePipelineDesc:descriptor=>{var desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+8),layout:WebGPU.makePipelineLayout(Number((growMemViews(),HEAPU64)[(descriptor+24)/8])),compute:WebGPU.makeComputeState(descriptor+32)};return desc},makeRenderPipelineDesc:descriptor=>{function makePrimitiveState(psPtr){if(!psPtr)return undefined;return{topology:WebGPU.PrimitiveTopology[(growMemViews(),HEAP32)[(psPtr+8)/4]],stripIndexFormat:WebGPU.IndexFormat[(growMemViews(),HEAP32)[(psPtr+12)/4]],frontFace:WebGPU.FrontFace[(growMemViews(),HEAP32)[(psPtr+16)/4]],cullMode:WebGPU.CullMode[(growMemViews(),HEAP32)[(psPtr+20)/4]],unclippedDepth:!!(growMemViews(),HEAPU32)[(psPtr+24)/4]}}function makeBlendComponent(bdPtr){if(!bdPtr)return undefined;return{operation:WebGPU.BlendOperation[(growMemViews(),HEAP32)[bdPtr/4]],srcFactor:WebGPU.BlendFactor[(growMemViews(),HEAP32)[(bdPtr+4)/4]],dstFactor:WebGPU.BlendFactor[(growMemViews(),HEAP32)[(bdPtr+8)/4]]}}function makeBlendState(bsPtr){if(!bsPtr)return undefined;return{alpha:makeBlendComponent(bsPtr+12),color:makeBlendComponent(bsPtr+0)}}function makeColorState(csPtr){var format=WebGPU.TextureFormat[(growMemViews(),HEAP32)[(csPtr+8)/4]];return format?{format,blend:makeBlendState(Number((growMemViews(),HEAPU64)[(csPtr+16)/8])),writeMask:(growMemViews(),HEAPU32)[(csPtr+24)/4]}:undefined}function makeColorStates(count,csArrayPtr){var states=[];for(var i=0;i<count;++i){states.push(makeColorState(csArrayPtr+32*i))}return states}function makeStencilStateFace(ssfPtr){return{compare:WebGPU.CompareFunction[(growMemViews(),HEAP32)[ssfPtr/4]],failOp:WebGPU.StencilOperation[(growMemViews(),HEAP32)[(ssfPtr+4)/4]],depthFailOp:WebGPU.StencilOperation[(growMemViews(),HEAP32)[(ssfPtr+8)/4]],passOp:WebGPU.StencilOperation[(growMemViews(),HEAP32)[(ssfPtr+12)/4]]}}function makeDepthStencilState(dssPtr){if(!dssPtr)return undefined;return{format:WebGPU.TextureFormat[(growMemViews(),HEAP32)[(dssPtr+8)/4]],depthWriteEnabled:!!(growMemViews(),HEAPU32)[(dssPtr+12)/4],depthCompare:WebGPU.CompareFunction[(growMemViews(),HEAP32)[(dssPtr+16)/4]],stencilFront:makeStencilStateFace(dssPtr+20),stencilBack:makeStencilStateFace(dssPtr+36),stencilReadMask:(growMemViews(),HEAPU32)[(dssPtr+52)/4],stencilWriteMask:(growMemViews(),HEAPU32)[(dssPtr+56)/4],depthBias:(growMemViews(),HEAP32)[(dssPtr+60)/4],depthBiasSlopeScale:(growMemViews(),HEAPF32)[(dssPtr+64)/4],depthBiasClamp:(growMemViews(),HEAPF32)[(dssPtr+68)/4]}}function makeVertexAttribute(vaPtr){return{format:WebGPU.VertexFormat[(growMemViews(),HEAP32)[(vaPtr+8)/4]],offset:readI53FromI64(vaPtr+16),shaderLocation:(growMemViews(),HEAPU32)[(vaPtr+24)/4]}}function makeVertexAttributes(count,vaArrayPtr){var vas=[];for(var i=0;i<count;++i){vas.push(makeVertexAttribute(vaArrayPtr+i*32))}return vas}function makeVertexBuffer(vbPtr){if(!vbPtr)return undefined;var stepMode=WebGPU.VertexStepMode[(growMemViews(),HEAP32)[(vbPtr+8)/4]];var attributeCount=Number((growMemViews(),HEAPU64)[(vbPtr+24)/8]);if(!stepMode&&!attributeCount){return null}return{arrayStride:readI53FromI64(vbPtr+16),stepMode,attributes:makeVertexAttributes(attributeCount,Number((growMemViews(),HEAPU64)[(vbPtr+32)/8]))}}function makeVertexBuffers(count,vbArrayPtr){if(!count)return undefined;var vbs=[];for(var i=0;i<count;++i){vbs.push(makeVertexBuffer(vbArrayPtr+i*40))}return vbs}function makeVertexState(viPtr){if(!viPtr)return undefined;var desc={module:WebGPU.getJsObject(Number((growMemViews(),HEAPU64)[(viPtr+8)/8])),constants:WebGPU.makePipelineConstants(Number((growMemViews(),HEAPU64)[(viPtr+32)/8]),Number((growMemViews(),HEAPU64)[(viPtr+40)/8])),buffers:makeVertexBuffers(Number((growMemViews(),HEAPU64)[(viPtr+48)/8]),Number((growMemViews(),HEAPU64)[(viPtr+56)/8])),entryPoint:WebGPU.makeStringFromOptionalStringView(viPtr+16)};return desc}function makeMultisampleState(msPtr){if(!msPtr)return undefined;return{count:(growMemViews(),HEAPU32)[(msPtr+8)/4],mask:(growMemViews(),HEAPU32)[(msPtr+12)/4],alphaToCoverageEnabled:!!(growMemViews(),HEAPU32)[(msPtr+16)/4]}}function makeFragmentState(fsPtr){if(!fsPtr)return undefined;var desc={module:WebGPU.getJsObject(Number((growMemViews(),HEAPU64)[(fsPtr+8)/8])),constants:WebGPU.makePipelineConstants(Number((growMemViews(),HEAPU64)[(fsPtr+32)/8]),Number((growMemViews(),HEAPU64)[(fsPtr+40)/8])),targets:makeColorStates(Number((growMemViews(),HEAPU64)[(fsPtr+48)/8]),Number((growMemViews(),HEAPU64)[(fsPtr+56)/8])),entryPoint:WebGPU.makeStringFromOptionalStringView(fsPtr+16)};return desc}var desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+8),layout:WebGPU.makePipelineLayout(Number((growMemViews(),HEAPU64)[(descriptor+24)/8])),vertex:makeVertexState(descriptor+32),primitive:makePrimitiveState(descriptor+96),depthStencil:makeDepthStencilState(Number((growMemViews(),HEAPU64)[(descriptor+128)/8])),multisample:makeMultisampleState(descriptor+136),fragment:makeFragmentState(Number((growMemViews(),HEAPU64)[(descriptor+160)/8]))};return desc},fillLimitStruct:(limits,limitsOutPtr)=>{var nextInChainPtr=Number((growMemViews(),HEAPU64)[limitsOutPtr/8]);function setLimitValueU32(name,basePtr,limitOffset,fallbackValue=0){var limitValue=limits[name]??fallbackValue;(growMemViews(),HEAPU32)[(basePtr+limitOffset)/4]=limitValue}function setLimitValueU64(name,basePtr,limitOffset,fallbackValue=0){var limitValue=limits[name]??fallbackValue;writeI53ToI64(basePtr+limitOffset,limitValue)}setLimitValueU32(\"maxTextureDimension1D\",limitsOutPtr,8);setLimitValueU32(\"maxTextureDimension2D\",limitsOutPtr,12);setLimitValueU32(\"maxTextureDimension3D\",limitsOutPtr,16);setLimitValueU32(\"maxTextureArrayLayers\",limitsOutPtr,20);setLimitValueU32(\"maxBindGroups\",limitsOutPtr,24);setLimitValueU32(\"maxBindGroupsPlusVertexBuffers\",limitsOutPtr,28);setLimitValueU32(\"maxBindingsPerBindGroup\",limitsOutPtr,32);setLimitValueU32(\"maxDynamicUniformBuffersPerPipelineLayout\",limitsOutPtr,36);setLimitValueU32(\"maxDynamicStorageBuffersPerPipelineLayout\",limitsOutPtr,40);setLimitValueU32(\"maxSampledTexturesPerShaderStage\",limitsOutPtr,44);setLimitValueU32(\"maxSamplersPerShaderStage\",limitsOutPtr,48);setLimitValueU32(\"maxStorageBuffersPerShaderStage\",limitsOutPtr,52);setLimitValueU32(\"maxStorageTexturesPerShaderStage\",limitsOutPtr,56);setLimitValueU32(\"maxUniformBuffersPerShaderStage\",limitsOutPtr,60);setLimitValueU32(\"minUniformBufferOffsetAlignment\",limitsOutPtr,80);setLimitValueU32(\"minStorageBufferOffsetAlignment\",limitsOutPtr,84);setLimitValueU64(\"maxUniformBufferBindingSize\",limitsOutPtr,64);setLimitValueU64(\"maxStorageBufferBindingSize\",limitsOutPtr,72);setLimitValueU32(\"maxVertexBuffers\",limitsOutPtr,88);setLimitValueU64(\"maxBufferSize\",limitsOutPtr,96);setLimitValueU32(\"maxVertexAttributes\",limitsOutPtr,104);setLimitValueU32(\"maxVertexBufferArrayStride\",limitsOutPtr,108);setLimitValueU32(\"maxInterStageShaderVariables\",limitsOutPtr,112);setLimitValueU32(\"maxColorAttachments\",limitsOutPtr,116);setLimitValueU32(\"maxColorAttachmentBytesPerSample\",limitsOutPtr,120);setLimitValueU32(\"maxComputeWorkgroupStorageSize\",limitsOutPtr,124);setLimitValueU32(\"maxComputeInvocationsPerWorkgroup\",limitsOutPtr,128);setLimitValueU32(\"maxComputeWorkgroupSizeX\",limitsOutPtr,132);setLimitValueU32(\"maxComputeWorkgroupSizeY\",limitsOutPtr,136);setLimitValueU32(\"maxComputeWorkgroupSizeZ\",limitsOutPtr,140);setLimitValueU32(\"maxComputeWorkgroupsPerDimension\",limitsOutPtr,144);setLimitValueU32(\"maxImmediateSize\",limitsOutPtr,148);if(nextInChainPtr!==0){var sType=(growMemViews(),HEAP32)[(nextInChainPtr+8)/4];var compatibilityModeLimitsPtr=nextInChainPtr;setLimitValueU32(\"maxStorageBuffersInVertexStage\",compatibilityModeLimitsPtr,16,limits.maxStorageBuffersPerShaderStage);setLimitValueU32(\"maxStorageBuffersInFragmentStage\",compatibilityModeLimitsPtr,24,limits.maxStorageBuffersPerShaderStage);setLimitValueU32(\"maxStorageTexturesInVertexStage\",compatibilityModeLimitsPtr,20,limits.maxStorageTexturesPerShaderStage);setLimitValueU32(\"maxStorageTexturesInFragmentStage\",compatibilityModeLimitsPtr,28,limits.maxStorageTexturesPerShaderStage)}},fillAdapterInfoStruct:(info,infoStruct)=>{(growMemViews(),HEAPU32)[(infoStruct+88)/4]=info.subgroupMinSize;(growMemViews(),HEAPU32)[(infoStruct+92)/4]=info.subgroupMaxSize;var strs=info.vendor+info.architecture+info.device+info.description;var strPtr=stringToNewUTF8(strs);var vendorLen=lengthBytesUTF8(info.vendor);WebGPU.setStringView(infoStruct+8,strPtr,vendorLen);strPtr+=vendorLen;var architectureLen=lengthBytesUTF8(info.architecture);WebGPU.setStringView(infoStruct+24,strPtr,architectureLen);strPtr+=architectureLen;var deviceLen=lengthBytesUTF8(info.device);WebGPU.setStringView(infoStruct+40,strPtr,deviceLen);strPtr+=deviceLen;var descriptionLen=lengthBytesUTF8(info.description);WebGPU.setStringView(infoStruct+56,strPtr,descriptionLen);strPtr+=descriptionLen;(growMemViews(),HEAP32)[(infoStruct+72)/4]=2;var adapterType=info.isFallbackAdapter?3:4;(growMemViews(),HEAP32)[(infoStruct+76)/4]=adapterType;(growMemViews(),HEAPU32)[(infoStruct+80)/4]=0;(growMemViews(),HEAPU32)[(infoStruct+84)/4]=0},AddressMode:[,\"clamp-to-edge\",\"repeat\",\"mirror-repeat\"],BlendFactor:[,\"zero\",\"one\",\"src\",\"one-minus-src\",\"src-alpha\",\"one-minus-src-alpha\",\"dst\",\"one-minus-dst\",\"dst-alpha\",\"one-minus-dst-alpha\",\"src-alpha-saturated\",\"constant\",\"one-minus-constant\",\"src1\",\"one-minus-src1\",\"src1-alpha\",\"one-minus-src1-alpha\"],BlendOperation:[,\"add\",\"subtract\",\"reverse-subtract\",\"min\",\"max\"],BufferBindingType:[,,\"uniform\",\"storage\",\"read-only-storage\"],BufferMapState:[,\"unmapped\",\"pending\",\"mapped\"],CompareFunction:[,\"never\",\"less\",\"equal\",\"less-equal\",\"greater\",\"not-equal\",\"greater-equal\",\"always\"],CompilationInfoRequestStatus:[,\"success\",\"callback-cancelled\"],ComponentSwizzle:[,\"0\",\"1\",\"r\",\"g\",\"b\",\"a\"],CompositeAlphaMode:[,\"opaque\",\"premultiplied\",\"unpremultiplied\",\"inherit\"],CullMode:[,\"none\",\"front\",\"back\"],ErrorFilter:[,\"validation\",\"out-of-memory\",\"internal\"],FeatureLevel:[,\"compatibility\",\"core\"],FeatureName:{1:\"core-features-and-limits\",2:\"depth-clip-control\",3:\"depth32float-stencil8\",4:\"texture-compression-bc\",5:\"texture-compression-bc-sliced-3d\",6:\"texture-compression-etc2\",7:\"texture-compression-astc\",8:\"texture-compression-astc-sliced-3d\",9:\"timestamp-query\",10:\"indirect-first-instance\",11:\"shader-f16\",12:\"rg11b10ufloat-renderable\",13:\"bgra8unorm-storage\",14:\"float32-filterable\",15:\"float32-blendable\",16:\"clip-distances\",17:\"dual-source-blending\",18:\"subgroups\",19:\"texture-formats-tier1\",20:\"texture-formats-tier2\",21:\"primitive-index\",22:\"texture-component-swizzle\",327692:\"chromium-experimental-unorm16-texture-formats\",327729:\"chromium-experimental-multi-draw-indirect\"},FilterMode:[,\"nearest\",\"linear\"],FrontFace:[,\"ccw\",\"cw\"],IndexFormat:[,\"uint16\",\"uint32\"],InstanceFeatureName:[,\"timed-wait-any\",\"shader-source-spirv\",\"multiple-devices-per-adapter\"],LoadOp:[,\"load\",\"clear\"],MipmapFilterMode:[,\"nearest\",\"linear\"],OptionalBool:[\"false\",\"true\"],PowerPreference:[,\"low-power\",\"high-performance\"],PredefinedColorSpace:[,\"srgb\",\"display-p3\"],PrimitiveTopology:[,\"point-list\",\"line-list\",\"line-strip\",\"triangle-list\",\"triangle-strip\"],QueryType:[,\"occlusion\",\"timestamp\"],SamplerBindingType:[,,\"filtering\",\"non-filtering\",\"comparison\"],Status:[,\"success\",\"error\"],StencilOperation:[,\"keep\",\"zero\",\"replace\",\"invert\",\"increment-clamp\",\"decrement-clamp\",\"increment-wrap\",\"decrement-wrap\"],StorageTextureAccess:[,,\"write-only\",\"read-only\",\"read-write\"],StoreOp:[,\"store\",\"discard\"],SurfaceGetCurrentTextureStatus:[,\"success-optimal\",\"success-suboptimal\",\"timeout\",\"outdated\",\"lost\",\"error\"],TextureAspect:[,\"all\",\"stencil-only\",\"depth-only\"],TextureDimension:[,\"1d\",\"2d\",\"3d\"],TextureFormat:[,\"r8unorm\",\"r8snorm\",\"r8uint\",\"r8sint\",\"r16unorm\",\"r16snorm\",\"r16uint\",\"r16sint\",\"r16float\",\"rg8unorm\",\"rg8snorm\",\"rg8uint\",\"rg8sint\",\"r32float\",\"r32uint\",\"r32sint\",\"rg16unorm\",\"rg16snorm\",\"rg16uint\",\"rg16sint\",\"rg16float\",\"rgba8unorm\",\"rgba8unorm-srgb\",\"rgba8snorm\",\"rgba8uint\",\"rgba8sint\",\"bgra8unorm\",\"bgra8unorm-srgb\",\"rgb10a2uint\",\"rgb10a2unorm\",\"rg11b10ufloat\",\"rgb9e5ufloat\",\"rg32float\",\"rg32uint\",\"rg32sint\",\"rgba16unorm\",\"rgba16snorm\",\"rgba16uint\",\"rgba16sint\",\"rgba16float\",\"rgba32float\",\"rgba32uint\",\"rgba32sint\",\"stencil8\",\"depth16unorm\",\"depth24plus\",\"depth24plus-stencil8\",\"depth32float\",\"depth32float-stencil8\",\"bc1-rgba-unorm\",\"bc1-rgba-unorm-srgb\",\"bc2-rgba-unorm\",\"bc2-rgba-unorm-srgb\",\"bc3-rgba-unorm\",\"bc3-rgba-unorm-srgb\",\"bc4-r-unorm\",\"bc4-r-snorm\",\"bc5-rg-unorm\",\"bc5-rg-snorm\",\"bc6h-rgb-ufloat\",\"bc6h-rgb-float\",\"bc7-rgba-unorm\",\"bc7-rgba-unorm-srgb\",\"etc2-rgb8unorm\",\"etc2-rgb8unorm-srgb\",\"etc2-rgb8a1unorm\",\"etc2-rgb8a1unorm-srgb\",\"etc2-rgba8unorm\",\"etc2-rgba8unorm-srgb\",\"eac-r11unorm\",\"eac-r11snorm\",\"eac-rg11unorm\",\"eac-rg11snorm\",\"astc-4x4-unorm\",\"astc-4x4-unorm-srgb\",\"astc-5x4-unorm\",\"astc-5x4-unorm-srgb\",\"astc-5x5-unorm\",\"astc-5x5-unorm-srgb\",\"astc-6x5-unorm\",\"astc-6x5-unorm-srgb\",\"astc-6x6-unorm\",\"astc-6x6-unorm-srgb\",\"astc-8x5-unorm\",\"astc-8x5-unorm-srgb\",\"astc-8x6-unorm\",\"astc-8x6-unorm-srgb\",\"astc-8x8-unorm\",\"astc-8x8-unorm-srgb\",\"astc-10x5-unorm\",\"astc-10x5-unorm-srgb\",\"astc-10x6-unorm\",\"astc-10x6-unorm-srgb\",\"astc-10x8-unorm\",\"astc-10x8-unorm-srgb\",\"astc-10x10-unorm\",\"astc-10x10-unorm-srgb\",\"astc-12x10-unorm\",\"astc-12x10-unorm-srgb\",\"astc-12x12-unorm\",\"astc-12x12-unorm-srgb\"],TextureSampleType:[,,\"float\",\"unfilterable-float\",\"depth\",\"sint\",\"uint\"],TextureViewDimension:[,\"1d\",\"2d\",\"2d-array\",\"cube\",\"cube-array\",\"3d\"],ToneMappingMode:[,\"standard\",\"extended\"],VertexFormat:[,\"uint8\",\"uint8x2\",\"uint8x4\",\"sint8\",\"sint8x2\",\"sint8x4\",\"unorm8\",\"unorm8x2\",\"unorm8x4\",\"snorm8\",\"snorm8x2\",\"snorm8x4\",\"uint16\",\"uint16x2\",\"uint16x4\",\"sint16\",\"sint16x2\",\"sint16x4\",\"unorm16\",\"unorm16x2\",\"unorm16x4\",\"snorm16\",\"snorm16x2\",\"snorm16x4\",\"float16\",\"float16x2\",\"float16x4\",\"float32\",\"float32x2\",\"float32x3\",\"float32x4\",\"uint32\",\"uint32x2\",\"uint32x3\",\"uint32x4\",\"sint32\",\"sint32x2\",\"sint32x3\",\"sint32x4\",\"unorm10-10-10-2\",\"unorm8x4-bgra\"],VertexStepMode:[,\"vertex\",\"instance\"],WGSLLanguageFeatureName:[,\"readonly_and_readwrite_storage_textures\",\"packed_4x8_integer_dot_product\",\"unrestricted_pointer_parameters\",\"pointer_composite_access\",\"uniform_buffer_standard_layout\",\"subgroup_id\",\"texture_and_sampler_let\",\"subgroup_uniformity\",\"texture_formats_tier1\"]};var emwgpuStringToInt_DeviceLostReason={undefined:1,unknown:1,destroyed:2};var runtimeKeepalivePop=()=>{runtimeKeepaliveCounter-=1};function _emwgpuAdapterRequestDevice(adapterPtr,futureId,deviceLostFutureId,devicePtr,queuePtr,descriptor){adapterPtr=bigintToI53Checked(adapterPtr);futureId=bigintToI53Checked(futureId);deviceLostFutureId=bigintToI53Checked(deviceLostFutureId);devicePtr=bigintToI53Checked(devicePtr);queuePtr=bigintToI53Checked(queuePtr);descriptor=bigintToI53Checked(descriptor);var adapter=WebGPU.getJsObject(adapterPtr);var desc={};if(descriptor){var requiredFeatureCount=Number((growMemViews(),HEAPU64)[(descriptor+24)/8]);if(requiredFeatureCount){var requiredFeaturesPtr=Number((growMemViews(),HEAPU64)[(descriptor+32)/8]);desc[\"requiredFeatures\"]=Array.from((growMemViews(),HEAPU32).subarray(requiredFeaturesPtr/4,(requiredFeaturesPtr+requiredFeatureCount*4)/4),feature=>WebGPU.FeatureName[feature])}var limitsPtr=Number((growMemViews(),HEAPU64)[(descriptor+40)/8]);if(limitsPtr){var nextInChainPtr=Number((growMemViews(),HEAPU64)[limitsPtr/8]);var requiredLimits={};function setLimitU32IfDefined(name,basePtr,limitOffset,ignoreIfZero=false){var ptr=basePtr+limitOffset;var value=(growMemViews(),HEAPU32)[ptr/4];if(value!=4294967295&&(!ignoreIfZero||value!=0)){requiredLimits[name]=value}}function setLimitU64IfDefined(name,basePtr,limitOffset){var ptr=basePtr+limitOffset;var limitPart1=(growMemViews(),HEAPU32)[ptr/4];var limitPart2=(growMemViews(),HEAPU32)[(ptr+4)/4];if(limitPart1!=4294967295||limitPart2!=4294967295){requiredLimits[name]=readI53FromI64(ptr)}}setLimitU32IfDefined(\"maxTextureDimension1D\",limitsPtr,8);setLimitU32IfDefined(\"maxTextureDimension2D\",limitsPtr,12);setLimitU32IfDefined(\"maxTextureDimension3D\",limitsPtr,16);setLimitU32IfDefined(\"maxTextureArrayLayers\",limitsPtr,20);setLimitU32IfDefined(\"maxBindGroups\",limitsPtr,24);setLimitU32IfDefined(\"maxBindGroupsPlusVertexBuffers\",limitsPtr,28);setLimitU32IfDefined(\"maxBindingsPerBindGroup\",limitsPtr,32);setLimitU32IfDefined(\"maxDynamicUniformBuffersPerPipelineLayout\",limitsPtr,36);setLimitU32IfDefined(\"maxDynamicStorageBuffersPerPipelineLayout\",limitsPtr,40);setLimitU32IfDefined(\"maxSampledTexturesPerShaderStage\",limitsPtr,44);setLimitU32IfDefined(\"maxSamplersPerShaderStage\",limitsPtr,48);setLimitU32IfDefined(\"maxStorageBuffersPerShaderStage\",limitsPtr,52);setLimitU32IfDefined(\"maxStorageTexturesPerShaderStage\",limitsPtr,56);setLimitU32IfDefined(\"maxUniformBuffersPerShaderStage\",limitsPtr,60);setLimitU32IfDefined(\"minUniformBufferOffsetAlignment\",limitsPtr,80);setLimitU32IfDefined(\"minStorageBufferOffsetAlignment\",limitsPtr,84);setLimitU64IfDefined(\"maxUniformBufferBindingSize\",limitsPtr,64);setLimitU64IfDefined(\"maxStorageBufferBindingSize\",limitsPtr,72);setLimitU32IfDefined(\"maxVertexBuffers\",limitsPtr,88);setLimitU64IfDefined(\"maxBufferSize\",limitsPtr,96);setLimitU32IfDefined(\"maxVertexAttributes\",limitsPtr,104);setLimitU32IfDefined(\"maxVertexBufferArrayStride\",limitsPtr,108);setLimitU32IfDefined(\"maxInterStageShaderVariables\",limitsPtr,112);setLimitU32IfDefined(\"maxColorAttachments\",limitsPtr,116);setLimitU32IfDefined(\"maxColorAttachmentBytesPerSample\",limitsPtr,120);setLimitU32IfDefined(\"maxComputeWorkgroupStorageSize\",limitsPtr,124);setLimitU32IfDefined(\"maxComputeInvocationsPerWorkgroup\",limitsPtr,128);setLimitU32IfDefined(\"maxComputeWorkgroupSizeX\",limitsPtr,132);setLimitU32IfDefined(\"maxComputeWorkgroupSizeY\",limitsPtr,136);setLimitU32IfDefined(\"maxComputeWorkgroupSizeZ\",limitsPtr,140);setLimitU32IfDefined(\"maxComputeWorkgroupsPerDimension\",limitsPtr,144);setLimitU32IfDefined(\"maxImmediateSize\",limitsPtr,148,true);if(nextInChainPtr!==0){var sType=(growMemViews(),HEAP32)[(nextInChainPtr+8)/4];var compatibilityModeLimitsPtr=nextInChainPtr;if(\"maxStorageBuffersInVertexStage\"in GPUSupportedLimits.prototype){setLimitU32IfDefined(\"maxStorageBuffersInVertexStage\",compatibilityModeLimitsPtr,16);setLimitU32IfDefined(\"maxStorageTexturesInVertexStage\",compatibilityModeLimitsPtr,20);setLimitU32IfDefined(\"maxStorageBuffersInFragmentStage\",compatibilityModeLimitsPtr,24);setLimitU32IfDefined(\"maxStorageTexturesInFragmentStage\",compatibilityModeLimitsPtr,28)}}desc[\"requiredLimits\"]=requiredLimits}var defaultQueuePtr=Number((growMemViews(),HEAPU64)[(descriptor+48)/8]);if(defaultQueuePtr){var defaultQueueDesc={label:WebGPU.makeStringFromOptionalStringView(defaultQueuePtr+8)};desc[\"defaultQueue\"]=defaultQueueDesc}desc[\"label\"]=WebGPU.makeStringFromOptionalStringView(descriptor+8)}runtimeKeepalivePush();WebGPU.Internals.futureInsert(futureId,adapter.requestDevice(desc).then(device=>{runtimeKeepalivePop();callUserCallback(()=>{WebGPU.Internals.jsObjectInsert(queuePtr,device.queue);WebGPU.Internals.jsObjectInsert(devicePtr,device);devicePtr=BigInt(devicePtr);WebGPU.Internals.futureInsert(deviceLostFutureId,device.lost.then(info=>{callUserCallback(()=>{device.onuncapturederror=ev=>{};var sp=stackSave();var messagePtr=stringToUTF8OnStack(info.message);_emwgpuOnDeviceLostCompleted(deviceLostFutureId,emwgpuStringToInt_DeviceLostReason[info.reason],BigInt(messagePtr));stackRestore(sp)})}));device.onuncapturederror=ev=>{var type=5;if(ev.error instanceof GPUValidationError)type=2;else if(ev.error instanceof GPUOutOfMemoryError)type=3;else if(ev.error instanceof GPUInternalError)type=4;var sp=stackSave();var messagePtr=stringToUTF8OnStack(ev.error.message);_emwgpuOnUncapturedError(BigInt(devicePtr),type,BigInt(messagePtr));stackRestore(sp)};_emwgpuOnRequestDeviceCompleted(futureId,1,BigInt(devicePtr),0n)})},ex=>{runtimeKeepalivePop();callUserCallback(()=>{var sp=stackSave();var messagePtr=stringToUTF8OnStack(ex.message);_emwgpuOnRequestDeviceCompleted(futureId,3,BigInt(devicePtr),BigInt(messagePtr));if(deviceLostFutureId){_emwgpuOnDeviceLostCompleted(deviceLostFutureId,4,BigInt(messagePtr))}stackRestore(sp)})}))}function _emwgpuBufferDestroy(bufferPtr){bufferPtr=bigintToI53Checked(bufferPtr);var buffer=WebGPU.getJsObject(bufferPtr);var onUnmap=WebGPU.Internals.bufferOnUnmaps[bufferPtr];if(onUnmap){for(var i=0;i<onUnmap.length;++i){onUnmap[i]()}delete WebGPU.Internals.bufferOnUnmaps[bufferPtr]}buffer.destroy()}var warnOnce=text=>{warnOnce.shown||={};if(!warnOnce.shown[text]){warnOnce.shown[text]=1;if(ENVIRONMENT_IS_NODE)text=\"warning: \"+text;err(text)}};var _emwgpuBufferGetConstMappedRange=function(bufferPtr,offset,size){bufferPtr=bigintToI53Checked(bufferPtr);offset=bigintToI53Checked(offset);size=bigintToI53Checked(size);var ret=(()=>{var buffer=WebGPU.getJsObject(bufferPtr);if(size==-1)size=undefined;var mapped;try{mapped=buffer.getMappedRange(offset,size)}catch(ex){return 0n}var data=_memalign(16,mapped.byteLength);(growMemViews(),HEAPU8).set(new Uint8Array(mapped),data);WebGPU.Internals.bufferOnUnmaps[bufferPtr].push(()=>_free(data));return data})();return BigInt(ret)};var _emwgpuBufferMapAsync=function(bufferPtr,futureId,mode,offset,size){bufferPtr=bigintToI53Checked(bufferPtr);futureId=bigintToI53Checked(futureId);mode=bigintToI53Checked(mode);offset=bigintToI53Checked(offset);size=bigintToI53Checked(size);var buffer=WebGPU.getJsObject(bufferPtr);WebGPU.Internals.bufferOnUnmaps[bufferPtr]=[];if(size==-1)size=undefined;runtimeKeepalivePush();WebGPU.Internals.futureInsert(futureId,buffer.mapAsync(mode,offset,size).then(()=>{runtimeKeepalivePop();callUserCallback(()=>{_emwgpuOnMapAsyncCompleted(futureId,1,0n)})},ex=>{runtimeKeepalivePop();callUserCallback(()=>{var sp=stackSave();var messagePtr=stringToUTF8OnStack(ex.message);var status=ex.name===\"AbortError\"?4:ex.name===\"OperationError\"?3:0;_emwgpuOnMapAsyncCompleted(futureId,status,BigInt(messagePtr));delete WebGPU.Internals.bufferOnUnmaps[bufferPtr]})}))};function _emwgpuBufferUnmap(bufferPtr){bufferPtr=bigintToI53Checked(bufferPtr);var buffer=WebGPU.getJsObject(bufferPtr);var onUnmap=WebGPU.Internals.bufferOnUnmaps[bufferPtr];if(!onUnmap){return}for(var i=0;i<onUnmap.length;++i){onUnmap[i]()}delete WebGPU.Internals.bufferOnUnmaps[bufferPtr];buffer.unmap()}function _emwgpuDelete(ptr){ptr=bigintToI53Checked(ptr);delete WebGPU.Internals.jsObjects[ptr]}function _emwgpuDeviceCreateBuffer(devicePtr,descriptor,bufferPtr){devicePtr=bigintToI53Checked(devicePtr);descriptor=bigintToI53Checked(descriptor);bufferPtr=bigintToI53Checked(bufferPtr);var mappedAtCreation=!!(growMemViews(),HEAPU32)[(descriptor+40)/4];var desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+8),usage:(growMemViews(),HEAPU32)[(descriptor+24)/4],size:readI53FromI64(descriptor+32),mappedAtCreation};var device=WebGPU.getJsObject(devicePtr);var buffer;if(self.__flightGpuBufferCreated)self.__flightGpuBufferCreated(desc.size);try{buffer=device.createBuffer(desc)}catch(ex){return false}WebGPU.Internals.jsObjectInsert(bufferPtr,buffer);if(mappedAtCreation){WebGPU.Internals.bufferOnUnmaps[bufferPtr]=[]}return true}function _emwgpuDeviceCreateShaderModule(devicePtr,descriptor,shaderModulePtr){devicePtr=bigintToI53Checked(devicePtr);descriptor=bigintToI53Checked(descriptor);shaderModulePtr=bigintToI53Checked(shaderModulePtr);var nextInChainPtr=Number((growMemViews(),HEAPU64)[descriptor/8]);var sType=(growMemViews(),HEAP32)[(nextInChainPtr+8)/4];var desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+8),code:\"\"};switch(sType){case 2:{desc[\"code\"]=WebGPU.makeStringFromStringView(nextInChainPtr+16);break}}var device=WebGPU.getJsObject(devicePtr);WebGPU.Internals.jsObjectInsert(shaderModulePtr,device.createShaderModule(desc))}var _emwgpuDeviceDestroy=devicePtr=>{const device=WebGPU.getJsObject(devicePtr);device.onuncapturederror=null;device.destroy()};function _emwgpuInstanceRequestAdapter(instancePtr,futureId,options,adapterPtr){instancePtr=bigintToI53Checked(instancePtr);futureId=bigintToI53Checked(futureId);options=bigintToI53Checked(options);adapterPtr=bigintToI53Checked(adapterPtr);var opts;if(options){opts={featureLevel:WebGPU.FeatureLevel[(growMemViews(),HEAP32)[(options+8)/4]],powerPreference:WebGPU.PowerPreference[(growMemViews(),HEAP32)[(options+12)/4]],forceFallbackAdapter:!!(growMemViews(),HEAPU32)[(options+16)/4]};var nextInChainPtr=Number((growMemViews(),HEAPU64)[options/8]);if(nextInChainPtr!==0){var sType=(growMemViews(),HEAP32)[(nextInChainPtr+8)/4];var webxrOptions=nextInChainPtr;opts.xrCompatible=!!(growMemViews(),HEAPU32)[(webxrOptions+16)/4]}}if(!(\"gpu\"in navigator)){var sp=stackSave();var messagePtr=stringToUTF8OnStack(\"WebGPU not available on this browser (navigator.gpu is not available)\");_emwgpuOnRequestAdapterCompleted(futureId,3,BigInt(adapterPtr),BigInt(messagePtr));stackRestore(sp);return}runtimeKeepalivePush();WebGPU.Internals.futureInsert(futureId,navigator.gpu.requestAdapter(opts).then(adapter=>{runtimeKeepalivePop();callUserCallback(()=>{if(adapter){WebGPU.Internals.jsObjectInsert(adapterPtr,adapter);_emwgpuOnRequestAdapterCompleted(futureId,1,BigInt(adapterPtr),0n)}else{var sp=stackSave();var messagePtr=stringToUTF8OnStack(\"WebGPU not available on this browser (requestAdapter returned null)\");_emwgpuOnRequestAdapterCompleted(futureId,3,BigInt(adapterPtr),BigInt(messagePtr));stackRestore(sp)}})},ex=>{runtimeKeepalivePop();callUserCallback(()=>{var sp=stackSave();var messagePtr=stringToUTF8OnStack(ex.message);_emwgpuOnRequestAdapterCompleted(futureId,4,BigInt(adapterPtr),BigInt(messagePtr));stackRestore(sp)})}))}var _emwgpuQueueOnSubmittedWorkDone=function(queuePtr,futureId){queuePtr=bigintToI53Checked(queuePtr);futureId=bigintToI53Checked(futureId);var queue=WebGPU.getJsObject(queuePtr);runtimeKeepalivePush();WebGPU.Internals.futureInsert(futureId,queue.onSubmittedWorkDone().then(()=>{runtimeKeepalivePop();callUserCallback(()=>{_emwgpuOnWorkDoneCompleted(futureId,1)})}))};var _emwgpuWaitAny=function(futurePtr,futureCount,timeoutMSPtr){futurePtr=bigintToI53Checked(futurePtr);futureCount=bigintToI53Checked(futureCount);timeoutMSPtr=bigintToI53Checked(timeoutMSPtr);return Asyncify.handleAsync(async()=>{var promises=[];if(timeoutMSPtr){var timeoutMS=(growMemViews(),HEAP32)[timeoutMSPtr/4];promises.length=futureCount+1;promises[futureCount]=new Promise(resolve=>setTimeout(resolve,timeoutMS,0))}else{promises.length=futureCount}for(var i=0;i<futureCount;++i){var futureId=readI53FromI64(futurePtr+i*8);if(!(futureId in WebGPU.Internals.futures)){return futureId}promises[i]=WebGPU.Internals.futures[futureId]}const firstResolvedFuture=await Promise.race(promises);delete WebGPU.Internals.futures[firstResolvedFuture];return firstResolvedFuture})};_emwgpuWaitAny.isAsync=true;var ENV={};var getExecutableName=()=>thisProgram||\"./this.program\";var getEnvStrings=()=>{if(!getEnvStrings.strings){var lang=(typeof navigator==\"object\"&&navigator.language||\"C\").replace(\"-\",\"_\")+\".UTF-8\";var env={USER:\"web_user\",LOGNAME:\"web_user\",PATH:\"/\",PWD:\"/\",HOME:\"/home/web_user\",LANG:lang,_:getExecutableName()};for(var x in ENV){if(ENV[x]===undefined)delete env[x];else env[x]=ENV[x]}var strings=[];for(var x in env){strings.push(`${x}=${env[x]}`)}getEnvStrings.strings=strings}return getEnvStrings.strings};function _environ_get(__environ,environ_buf){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(14,0,1,__environ,environ_buf);__environ=bigintToI53Checked(__environ);environ_buf=bigintToI53Checked(environ_buf);var bufSize=0;var envp=0;for(var string of getEnvStrings()){var ptr=environ_buf+bufSize;(growMemViews(),HEAPU64)[(__environ+envp)/8]=BigInt(ptr);bufSize+=stringToUTF8(string,ptr,Infinity)+1;envp+=8}return 0}function _environ_sizes_get(penviron_count,penviron_buf_size){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(15,0,1,penviron_count,penviron_buf_size);penviron_count=bigintToI53Checked(penviron_count);penviron_buf_size=bigintToI53Checked(penviron_buf_size);var strings=getEnvStrings();(growMemViews(),HEAPU64)[penviron_count/8]=BigInt(strings.length);var bufSize=0;for(var string of strings){bufSize+=lengthBytesUTF8(string)+1}(growMemViews(),HEAPU64)[penviron_buf_size/8]=BigInt(bufSize);return 0}function _fd_close(fd){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(16,0,1,fd);try{var stream=SYSCALLS.getStreamFromFD(fd);FS.close(stream);return 0}catch(e){if(typeof FS==\"undefined\"||!(e.name===\"ErrnoError\"))throw e;return e.errno}}var doReadv=(stream,iov,iovcnt,offset)=>{var ret=0;for(var i=0;i<iovcnt;i++){var ptr=Number((growMemViews(),HEAPU64)[iov/8]);var len=Number((growMemViews(),HEAPU64)[(iov+8)/8]);iov+=16;var curr=FS.read(stream,(growMemViews(),HEAP8),ptr,len,offset);if(curr<0)return-1;ret+=curr;if(curr<len)break;if(typeof offset!=\"undefined\"){offset+=curr}}return ret};function _fd_read(fd,iov,iovcnt,pnum){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(17,0,1,fd,iov,iovcnt,pnum);iov=bigintToI53Checked(iov);iovcnt=bigintToI53Checked(iovcnt);pnum=bigintToI53Checked(pnum);try{var stream=SYSCALLS.getStreamFromFD(fd);var num=doReadv(stream,iov,iovcnt);(growMemViews(),HEAPU64)[pnum/8]=BigInt(num);return 0}catch(e){if(typeof FS==\"undefined\"||!(e.name===\"ErrnoError\"))throw e;return e.errno}}function _fd_seek(fd,offset,whence,newOffset){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(18,0,1,fd,offset,whence,newOffset);offset=bigintToI53Checked(offset);newOffset=bigintToI53Checked(newOffset);try{if(isNaN(offset))return 61;var stream=SYSCALLS.getStreamFromFD(fd);FS.llseek(stream,offset,whence);(growMemViews(),HEAP64)[newOffset/8]=BigInt(stream.position);if(stream.getdents&&offset===0&&whence===0)stream.getdents=null;return 0}catch(e){if(typeof FS==\"undefined\"||!(e.name===\"ErrnoError\"))throw e;return e.errno}}var doWritev=(stream,iov,iovcnt,offset)=>{var ret=0;for(var i=0;i<iovcnt;i++){var ptr=Number((growMemViews(),HEAPU64)[iov/8]);var len=Number((growMemViews(),HEAPU64)[(iov+8)/8]);iov+=16;var curr=FS.write(stream,(growMemViews(),HEAP8),ptr,len,offset);if(curr<0)return-1;ret+=curr;if(curr<len){break}if(typeof offset!=\"undefined\"){offset+=curr}}return ret};function _fd_write(fd,iov,iovcnt,pnum){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(19,0,1,fd,iov,iovcnt,pnum);iov=bigintToI53Checked(iov);iovcnt=bigintToI53Checked(iovcnt);pnum=bigintToI53Checked(pnum);try{var stream=SYSCALLS.getStreamFromFD(fd);var num=doWritev(stream,iov,iovcnt);(growMemViews(),HEAPU64)[pnum/8]=BigInt(num);return 0}catch(e){if(typeof FS==\"undefined\"||!(e.name===\"ErrnoError\"))throw e;return e.errno}}function _random_get(buffer,size){buffer=bigintToI53Checked(buffer);size=bigintToI53Checked(size);try{randomFill((growMemViews(),HEAPU8).subarray(buffer,buffer+size));return 0}catch(e){if(typeof FS==\"undefined\"||!(e.name===\"ErrnoError\"))throw e;return e.errno}}function _wgpuAdapterGetInfo(adapterPtr,info){adapterPtr=bigintToI53Checked(adapterPtr);info=bigintToI53Checked(info);var adapter=WebGPU.getJsObject(adapterPtr);WebGPU.fillAdapterInfoStruct(adapter.info,info);return 1}function _wgpuAdapterGetLimits(adapterPtr,limitsOutPtr){adapterPtr=bigintToI53Checked(adapterPtr);limitsOutPtr=bigintToI53Checked(limitsOutPtr);var adapter=WebGPU.getJsObject(adapterPtr);WebGPU.fillLimitStruct(adapter.limits,limitsOutPtr);return 1}function _wgpuAdapterHasFeature(adapterPtr,featureEnumValue){adapterPtr=bigintToI53Checked(adapterPtr);var adapter=WebGPU.getJsObject(adapterPtr);return adapter.features.has(WebGPU.FeatureName[featureEnumValue])}var _wgpuBufferGetSize=function(bufferPtr){bufferPtr=bigintToI53Checked(bufferPtr);var ret=(()=>{var buffer=WebGPU.getJsObject(bufferPtr);return buffer.size})();return BigInt(ret)};var _wgpuCommandEncoderBeginComputePass=function(encoderPtr,descriptor){encoderPtr=bigintToI53Checked(encoderPtr);descriptor=bigintToI53Checked(descriptor);var ret=(()=>{var desc;if(descriptor){desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+8),timestampWrites:WebGPU.makePassTimestampWrites(Number((growMemViews(),HEAPU64)[(descriptor+24)/8]))}}var commandEncoder=WebGPU.getJsObject(encoderPtr);var ptr=_emwgpuCreateComputePassEncoder(0n);WebGPU.Internals.jsObjectInsert(ptr,commandEncoder.beginComputePass(desc));return ptr})();return BigInt(ret)};function _wgpuCommandEncoderCopyBufferToBuffer(encoderPtr,srcPtr,srcOffset,dstPtr,dstOffset,size){encoderPtr=bigintToI53Checked(encoderPtr);srcPtr=bigintToI53Checked(srcPtr);srcOffset=bigintToI53Checked(srcOffset);dstPtr=bigintToI53Checked(dstPtr);dstOffset=bigintToI53Checked(dstOffset);size=bigintToI53Checked(size);var commandEncoder=WebGPU.getJsObject(encoderPtr);var src=WebGPU.getJsObject(srcPtr);var dst=WebGPU.getJsObject(dstPtr);commandEncoder.copyBufferToBuffer(src,srcOffset,dst,dstOffset,size)}var _wgpuCommandEncoderFinish=function(encoderPtr,descriptor){encoderPtr=bigintToI53Checked(encoderPtr);descriptor=bigintToI53Checked(descriptor);var ret=(()=>{var commandEncoder=WebGPU.getJsObject(encoderPtr);var ptr=_emwgpuCreateCommandBuffer(0n);WebGPU.Internals.jsObjectInsert(ptr,commandEncoder.finish());return ptr})();return BigInt(ret)};function _wgpuComputePassEncoderDispatchWorkgroups(passPtr,x,y,z){passPtr=bigintToI53Checked(passPtr);var pass=WebGPU.getJsObject(passPtr);pass.dispatchWorkgroups(x,y,z)}function _wgpuComputePassEncoderEnd(passPtr){passPtr=bigintToI53Checked(passPtr);var pass=WebGPU.getJsObject(passPtr);pass.end()}function _wgpuComputePassEncoderSetBindGroup(passPtr,groupIndex,groupPtr,dynamicOffsetCount,dynamicOffsetsPtr){passPtr=bigintToI53Checked(passPtr);groupPtr=bigintToI53Checked(groupPtr);dynamicOffsetCount=bigintToI53Checked(dynamicOffsetCount);dynamicOffsetsPtr=bigintToI53Checked(dynamicOffsetsPtr);var pass=WebGPU.getJsObject(passPtr);var group=WebGPU.getJsObject(groupPtr);if(dynamicOffsetCount==0){pass.setBindGroup(groupIndex,group)}else{pass.setBindGroup(groupIndex,group,(growMemViews(),HEAPU32),dynamicOffsetsPtr/4,dynamicOffsetCount)}}function _wgpuComputePassEncoderSetPipeline(passPtr,pipelinePtr){passPtr=bigintToI53Checked(passPtr);pipelinePtr=bigintToI53Checked(pipelinePtr);var pass=WebGPU.getJsObject(passPtr);var pipeline=WebGPU.getJsObject(pipelinePtr);pass.setPipeline(pipeline)}var _wgpuComputePipelineGetBindGroupLayout=function(pipelinePtr,groupIndex){pipelinePtr=bigintToI53Checked(pipelinePtr);var ret=(()=>{var pipeline=WebGPU.getJsObject(pipelinePtr);var ptr=_emwgpuCreateBindGroupLayout(0n);WebGPU.Internals.jsObjectInsert(ptr,pipeline.getBindGroupLayout(groupIndex));return ptr})();return BigInt(ret)};var _wgpuDeviceCreateBindGroup=function(devicePtr,descriptor){devicePtr=bigintToI53Checked(devicePtr);descriptor=bigintToI53Checked(descriptor);var ret=(()=>{function makeEntry(entryPtr){var bufferPtr=Number((growMemViews(),HEAPU64)[(entryPtr+16)/8]);var samplerPtr=Number((growMemViews(),HEAPU64)[(entryPtr+40)/8]);var textureViewPtr=Number((growMemViews(),HEAPU64)[(entryPtr+48)/8]);var externalTexturePtr=0;WebGPU.iterateExtensions(entryPtr,{327681:ptr=>{externalTexturePtr=Number((growMemViews(),HEAPU64)[(ptr+16)/8])}});var resource;if(bufferPtr){var size=readI53FromI64(entryPtr+32);if(size==-1)size=undefined;resource={buffer:WebGPU.getJsObject(bufferPtr),offset:readI53FromI64(entryPtr+24),size}}else{resource=WebGPU.getJsObject(samplerPtr||textureViewPtr||externalTexturePtr)}return{binding:(growMemViews(),HEAPU32)[(entryPtr+8)/4],resource}}function makeEntries(count,entriesPtrs){var entries=[];for(var i=0;i<count;++i){entries.push(makeEntry(entriesPtrs+56*i))}return entries}var desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+8),layout:WebGPU.getJsObject(Number((growMemViews(),HEAPU64)[(descriptor+24)/8])),entries:makeEntries(Number((growMemViews(),HEAPU64)[(descriptor+32)/8]),Number((growMemViews(),HEAPU64)[(descriptor+40)/8]))};var device=WebGPU.getJsObject(devicePtr);var ptr=_emwgpuCreateBindGroup(0n);WebGPU.Internals.jsObjectInsert(ptr,device.createBindGroup(desc));return ptr})();return BigInt(ret)};var _wgpuDeviceCreateCommandEncoder=function(devicePtr,descriptor){devicePtr=bigintToI53Checked(devicePtr);descriptor=bigintToI53Checked(descriptor);var ret=(()=>{var desc;if(descriptor){desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+8)}}var device=WebGPU.getJsObject(devicePtr);var ptr=_emwgpuCreateCommandEncoder(0n);WebGPU.Internals.jsObjectInsert(ptr,device.createCommandEncoder(desc));return ptr})();return BigInt(ret)};var _wgpuDeviceCreateComputePipeline=function(devicePtr,descriptor){devicePtr=bigintToI53Checked(devicePtr);descriptor=bigintToI53Checked(descriptor);var ret=(()=>{var desc=WebGPU.makeComputePipelineDesc(descriptor);var device=WebGPU.getJsObject(devicePtr);var ptr=_emwgpuCreateComputePipeline(0n);if(self.__flightGpuPipelineCreated)self.__flightGpuPipelineCreated();WebGPU.Internals.jsObjectInsert(ptr,device.createComputePipeline(desc));return ptr})();return BigInt(ret)};function _wgpuInstanceHasWGSLLanguageFeature(instance,featureEnumValue){instance=bigintToI53Checked(instance);if(!(\"wgslLanguageFeatures\"in navigator.gpu)){return false}return navigator.gpu.wgslLanguageFeatures.has(WebGPU.WGSLLanguageFeatureName[featureEnumValue])}var _wgpuQueueSubmit=function(queuePtr,commandCount,commands){queuePtr=bigintToI53Checked(queuePtr);commandCount=bigintToI53Checked(commandCount);commands=bigintToI53Checked(commands);var queue=WebGPU.getJsObject(queuePtr);var cmds=Array.from((growMemViews(),HEAP64).subarray(commands/8,(commands+commandCount*8)/8),id=>WebGPU.getJsObject(id));queue.submit(cmds)};function _wgpuQueueWriteBuffer(queuePtr,bufferPtr,bufferOffset,data,size){queuePtr=bigintToI53Checked(queuePtr);bufferPtr=bigintToI53Checked(bufferPtr);bufferOffset=bigintToI53Checked(bufferOffset);data=bigintToI53Checked(data);size=bigintToI53Checked(size);var queue=WebGPU.getJsObject(queuePtr);var buffer=WebGPU.getJsObject(bufferPtr);var subarray=(growMemViews(),HEAPU8).subarray(data,data+size);queue.writeBuffer(buffer,bufferOffset,subarray,0,size)}var Asyncify={instrumentWasmImports(imports){var importPattern=/^(invoke_.*|__asyncjs__.*)$/;for(let[x,original]of Object.entries(imports)){if(typeof original==\"function\"){let isAsyncifyImport=original.isAsync||importPattern.test(x);if(isAsyncifyImport){imports[x]=original=new WebAssembly.Suspending(original)}}}},instrumentFunction(original){var wrapper=(...args)=>original(...args);return wrapper},instrumentWasmExports(exports){var exportPattern=/^(wllama_start|wllama_action|main|__main_argc_argv)$/;Asyncify.asyncExports=new Set;var ret={};for(let[x,original]of Object.entries(exports)){if(typeof original==\"function\"){let isAsyncifyExport=exportPattern.test(x);if(isAsyncifyExport){Asyncify.asyncExports.add(original);original=Asyncify.makeAsyncFunction(original)}var wrapper=Asyncify.instrumentFunction(original);ret[x]=wrapper}else{ret[x]=original}}return ret},asyncExports:null,isAsyncExport(func){return Asyncify.asyncExports?.has(func)},handleAsync:async startAsync=>{runtimeKeepalivePush();try{return await startAsync()}finally{runtimeKeepalivePop()}},handleSleep:startAsync=>Asyncify.handleAsync(()=>new Promise(startAsync)),makeAsyncFunction(original){return WebAssembly.promising(original)}};var getCFunc=ident=>{var func=Module[\"_\"+ident];return func};var writeArrayToMemory=(array,buffer)=>{(growMemViews(),HEAP8).set(array,buffer)};var ccall=(ident,returnType,argTypes,args,opts)=>{var toC={pointer:p=>BigInt(p),string:str=>{var ret=0;if(str!==null&&str!==undefined&&str!==0){ret=stringToUTF8OnStack(str)}return BigInt(ret)},array:arr=>{var ret=stackAlloc(arr.length);writeArrayToMemory(arr,ret);return BigInt(ret)}};function convertReturnValue(ret){if(returnType===\"string\"){return UTF8ToString(Number(ret))}if(returnType===\"pointer\")return Number(ret);if(returnType===\"boolean\")return Boolean(ret);return ret}var func=getCFunc(ident);var cArgs=[];var stack=0;if(args){for(var i=0;i<args.length;i++){var converter=toC[argTypes[i]];if(converter){if(stack===0)stack=stackSave();cArgs[i]=converter(args[i])}else{cArgs[i]=args[i]}}}var ret=func(...cArgs);function onDone(ret){if(stack!==0)stackRestore(stack);if(ident===\"wllama_action\"&&(ret===0||ret===0n)){var actionName=args&&args[0]||\"unknown\";var nativeError=new Error(\"Native action failed: action=\"+actionName+\" marker=native-action-null-output\");nativeError.name=\"WllamaNativeActionError\";nativeError.action=actionName;nativeError.marker=\"native-action-null-output\";throw nativeError}return convertReturnValue(ret)}var asyncMode=opts?.async;if(asyncMode)return ret.then(onDone);ret=onDone(ret);return ret};var cwrap=(ident,returnType,argTypes,opts)=>{var numericArgs=!argTypes||argTypes.every(type=>type===\"number\"||type===\"boolean\");var numericRet=returnType!==\"string\";if(numericRet&&numericArgs&&!opts){return getCFunc(ident)}return(...args)=>ccall(ident,returnType,argTypes,args,opts)};var FS_createPath=(...args)=>FS.createPath(...args);var FS_unlink=(...args)=>FS.unlink(...args);var FS_createLazyFile=(...args)=>FS.createLazyFile(...args);var FS_createDevice=(...args)=>FS.createDevice(...args);PThread.init();FS.createPreloadedFile=FS_createPreloadedFile;FS.preloadFile=FS_preloadFile;FS.staticInit();{initMemory();if(Module[\"noExitRuntime\"])noExitRuntime=Module[\"noExitRuntime\"];if(Module[\"preloadPlugins\"])preloadPlugins=Module[\"preloadPlugins\"];if(Module[\"print\"])out=Module[\"print\"];if(Module[\"printErr\"])err=Module[\"printErr\"];if(Module[\"wasmBinary\"])wasmBinary=Module[\"wasmBinary\"];if(Module[\"arguments\"])arguments_=Module[\"arguments\"];if(Module[\"thisProgram\"])thisProgram=Module[\"thisProgram\"];if(Module[\"preInit\"]){if(typeof Module[\"preInit\"]==\"function\")Module[\"preInit\"]=[Module[\"preInit\"]];while(Module[\"preInit\"].length>0){Module[\"preInit\"].shift()()}}}Module[\"ENV\"]=ENV;Module[\"mmapAlloc\"]=mmapAlloc;Module[\"wasmMemory\"]=wasmMemory;Module[\"addRunDependency\"]=addRunDependency;Module[\"removeRunDependency\"]=removeRunDependency;Module[\"ccall\"]=ccall;Module[\"cwrap\"]=cwrap;Module[\"FS_preloadFile\"]=FS_preloadFile;Module[\"FS_unlink\"]=FS_unlink;Module[\"FS_createPath\"]=FS_createPath;Module[\"FS_createDevice\"]=FS_createDevice;Module[\"FS\"]=FS;Module[\"FS_createDataFile\"]=FS_createDataFile;Module[\"FS_createLazyFile\"]=FS_createLazyFile;Module[\"MEMFS\"]=MEMFS;var proxiedFunctionTable=[_proc_exit,exitOnMainThread,pthreadCreateProxied,___syscall_fcntl64,___syscall_fstat64,___syscall_getcwd,___syscall_getdents64,___syscall_ioctl,___syscall_lstat64,___syscall_newfstatat,___syscall_openat,___syscall_stat64,__mmap_js,__munmap_js,_environ_get,_environ_sizes_get,_fd_close,_fd_read,_fd_seek,_fd_write];var ASM_CONSTS={2062096:()=>(growMemViews(),HEAP8).length};function speechtest_flight_js(phase,op,edge,op_serial,tensor_id,requested,actual,payload,offs,error_code,malloc_live,malloc_free,sbrk_bytes){if(self.__flight)self.__flight.nativeCheckpoint(phase|0,op|0,edge|0,op_serial>>>0,tensor_id>>>0,requested,actual,payload,offs,error_code>>>0,malloc_live,malloc_free,sbrk_bytes)}speechtest_flight_js.sig=\"viiiiiddddiddd\";function speechtest_flight_present_js(){return self.__flight?1:0}speechtest_flight_present_js.sig=\"i\";function __asyncjs__js_file_read(path_ptr,offset,req_size,out_ptr){return Asyncify.handleAsync(async()=>await _wllama_js_file_read(UTF8ToString(Number(path_ptr)),Number(offset),Number(req_size),Number(out_ptr)))}__asyncjs__js_file_read.sig=\"jjjjj\";function __asyncjs__speechtest_model_source_release_js(){return Asyncify.handleAsync(async()=>{if(self.__speechtestModelSourceState===\"released\"){throw new Error(\"model source release requested more than once\")}if(self.__speechtestModelSourceState===\"release-pending\"){throw new Error(\"model source release already pending\")}self.__speechtestModelSourceState=\"release-pending\";const receipt=await new Promise((resolve,reject)=>{self.__speechtestModelSourceReleaseResolve=resolve;self.__speechtestModelSourceReleaseReject=reject;postMessage({verb:\"model.source_consumed\",args:[{schemaVersion:1}]})});self.__speechtestModelSourceReleaseResolve=null;self.__speechtestModelSourceReleaseReject=null;if(!receipt||receipt.released!==true){self.__speechtestModelSourceState=\"release-failed\";throw new Error(\"model source release was not acknowledged\")}self.__speechtestModelSourceState=\"released\";return 1})}__asyncjs__speechtest_model_source_release_js.sig=\"i\";var _malloc,_free,_wllama_malloc,_wllama_action_response_length,_wllama_start,_wllama_action,_wllama_exit,_wllama_debug,_main,_emwgpuCreateBindGroup,_emwgpuCreateBindGroupLayout,_emwgpuCreateCommandBuffer,_emwgpuCreateCommandEncoder,_emwgpuCreateComputePassEncoder,_emwgpuCreateComputePipeline,_emwgpuCreateExternalTexture,_emwgpuCreatePipelineLayout,_emwgpuCreateQuerySet,_emwgpuCreateRenderBundle,_emwgpuCreateRenderBundleEncoder,_emwgpuCreateRenderPassEncoder,_emwgpuCreateRenderPipeline,_emwgpuCreateSampler,_emwgpuCreateSurface,_emwgpuCreateTexture,_emwgpuCreateTextureView,_emwgpuCreateAdapter,_emwgpuCreateBuffer,_emwgpuCreateDevice,_emwgpuCreateQueue,_emwgpuCreateShaderModule,_emwgpuOnDeviceLostCompleted,_emwgpuOnMapAsyncCompleted,_emwgpuOnRequestAdapterCompleted,_emwgpuOnRequestDeviceCompleted,_emwgpuOnWorkDoneCompleted,_emwgpuOnUncapturedError,__emscripten_tls_init,_pthread_self,_emscripten_builtin_memalign,__emscripten_thread_init,__emscripten_thread_crashed,__emscripten_run_js_on_main_thread,__emscripten_thread_free_data,__emscripten_thread_exit,__emscripten_check_mailbox,_memalign,___trap,_emscripten_stack_set_limits,__emscripten_stack_restore,__emscripten_stack_alloc,_emscripten_stack_get_current,__indirect_function_table,wasmTable;function assignWasmExports(wasmExports){_malloc=wasmExports[\"malloc\"];_free=wasmExports[\"free\"];_wllama_malloc=Module[\"_wllama_malloc\"]=wasmExports[\"wllama_malloc\"];_wllama_action_response_length=Module[\"_wllama_action_response_length\"]=wasmExports[\"wllama_action_response_length\"];_wllama_start=Module[\"_wllama_start\"]=wasmExports[\"wllama_start\"];_wllama_action=Module[\"_wllama_action\"]=wasmExports[\"wllama_action\"];_wllama_exit=Module[\"_wllama_exit\"]=wasmExports[\"wllama_exit\"];_wllama_debug=Module[\"_wllama_debug\"]=wasmExports[\"wllama_debug\"];_main=Module[\"_main\"]=wasmExports[\"main\"];_emwgpuCreateBindGroup=wasmExports[\"emwgpuCreateBindGroup\"];_emwgpuCreateBindGroupLayout=wasmExports[\"emwgpuCreateBindGroupLayout\"];_emwgpuCreateCommandBuffer=wasmExports[\"emwgpuCreateCommandBuffer\"];_emwgpuCreateCommandEncoder=wasmExports[\"emwgpuCreateCommandEncoder\"];_emwgpuCreateComputePassEncoder=wasmExports[\"emwgpuCreateComputePassEncoder\"];_emwgpuCreateComputePipeline=wasmExports[\"emwgpuCreateComputePipeline\"];_emwgpuCreateExternalTexture=wasmExports[\"emwgpuCreateExternalTexture\"];_emwgpuCreatePipelineLayout=wasmExports[\"emwgpuCreatePipelineLayout\"];_emwgpuCreateQuerySet=wasmExports[\"emwgpuCreateQuerySet\"];_emwgpuCreateRenderBundle=wasmExports[\"emwgpuCreateRenderBundle\"];_emwgpuCreateRenderBundleEncoder=wasmExports[\"emwgpuCreateRenderBundleEncoder\"];_emwgpuCreateRenderPassEncoder=wasmExports[\"emwgpuCreateRenderPassEncoder\"];_emwgpuCreateRenderPipeline=wasmExports[\"emwgpuCreateRenderPipeline\"];_emwgpuCreateSampler=wasmExports[\"emwgpuCreateSampler\"];_emwgpuCreateSurface=wasmExports[\"emwgpuCreateSurface\"];_emwgpuCreateTexture=wasmExports[\"emwgpuCreateTexture\"];_emwgpuCreateTextureView=wasmExports[\"emwgpuCreateTextureView\"];_emwgpuCreateAdapter=wasmExports[\"emwgpuCreateAdapter\"];_emwgpuCreateBuffer=wasmExports[\"emwgpuCreateBuffer\"];_emwgpuCreateDevice=wasmExports[\"emwgpuCreateDevice\"];_emwgpuCreateQueue=wasmExports[\"emwgpuCreateQueue\"];_emwgpuCreateShaderModule=wasmExports[\"emwgpuCreateShaderModule\"];_emwgpuOnDeviceLostCompleted=wasmExports[\"emwgpuOnDeviceLostCompleted\"];_emwgpuOnMapAsyncCompleted=wasmExports[\"emwgpuOnMapAsyncCompleted\"];_emwgpuOnRequestAdapterCompleted=wasmExports[\"emwgpuOnRequestAdapterCompleted\"];_emwgpuOnRequestDeviceCompleted=wasmExports[\"emwgpuOnRequestDeviceCompleted\"];_emwgpuOnWorkDoneCompleted=wasmExports[\"emwgpuOnWorkDoneCompleted\"];_emwgpuOnUncapturedError=wasmExports[\"emwgpuOnUncapturedError\"];__emscripten_tls_init=wasmExports[\"_emscripten_tls_init\"];_pthread_self=wasmExports[\"pthread_self\"];_emscripten_builtin_memalign=wasmExports[\"emscripten_builtin_memalign\"];__emscripten_thread_init=wasmExports[\"_emscripten_thread_init\"];__emscripten_thread_crashed=wasmExports[\"_emscripten_thread_crashed\"];__emscripten_run_js_on_main_thread=wasmExports[\"_emscripten_run_js_on_main_thread\"];__emscripten_thread_free_data=wasmExports[\"_emscripten_thread_free_data\"];__emscripten_thread_exit=wasmExports[\"_emscripten_thread_exit\"];__emscripten_check_mailbox=wasmExports[\"_emscripten_check_mailbox\"];_memalign=wasmExports[\"memalign\"];___trap=wasmExports[\"__trap\"];_emscripten_stack_set_limits=wasmExports[\"emscripten_stack_set_limits\"];__emscripten_stack_restore=wasmExports[\"_emscripten_stack_restore\"];__emscripten_stack_alloc=wasmExports[\"_emscripten_stack_alloc\"];_emscripten_stack_get_current=wasmExports[\"emscripten_stack_get_current\"];__indirect_function_table=wasmTable=wasmExports[\"__indirect_function_table\"]}var wasmImports;function assignWasmImports(){wasmImports={__asyncjs__js_file_read,__asyncjs__speechtest_model_source_release_js,__pthread_create_js:___pthread_create_js,__syscall_fcntl64:___syscall_fcntl64,__syscall_getcwd:___syscall_getcwd,__syscall_getdents64:___syscall_getdents64,__syscall_ioctl:___syscall_ioctl,__syscall_openat:___syscall_openat,__syscall_stat64:___syscall_stat64,_abort_js:__abort_js,_emscripten_init_main_thread_js:__emscripten_init_main_thread_js,_emscripten_notify_mailbox_postmessage:__emscripten_notify_mailbox_postmessage,_emscripten_receive_on_main_thread_js:__emscripten_receive_on_main_thread_js,_emscripten_thread_cleanup:__emscripten_thread_cleanup,_emscripten_thread_mailbox_await:__emscripten_thread_mailbox_await,_emscripten_thread_set_strongref:__emscripten_thread_set_strongref,_localtime_js:__localtime_js,_mmap_js:__mmap_js,_munmap_js:__munmap_js,_tzset_js:__tzset_js,clock_time_get:_clock_time_get,emscripten_asm_const_double:_emscripten_asm_const_double,emscripten_check_blocking_allowed:_emscripten_check_blocking_allowed,emscripten_date_now:_emscripten_date_now,emscripten_exit_with_live_runtime:_emscripten_exit_with_live_runtime,emscripten_get_callstack:_emscripten_get_callstack,emscripten_get_heap_max:_emscripten_get_heap_max,emscripten_get_now:_emscripten_get_now,emscripten_has_asyncify:_emscripten_has_asyncify,emscripten_num_logical_cores:_emscripten_num_logical_cores,emscripten_resize_heap:_emscripten_resize_heap,emwgpuAdapterRequestDevice:_emwgpuAdapterRequestDevice,emwgpuBufferDestroy:_emwgpuBufferDestroy,emwgpuBufferGetConstMappedRange:_emwgpuBufferGetConstMappedRange,emwgpuBufferMapAsync:_emwgpuBufferMapAsync,emwgpuBufferUnmap:_emwgpuBufferUnmap,emwgpuDelete:_emwgpuDelete,emwgpuDeviceCreateBuffer:_emwgpuDeviceCreateBuffer,emwgpuDeviceCreateShaderModule:_emwgpuDeviceCreateShaderModule,emwgpuDeviceDestroy:_emwgpuDeviceDestroy,emwgpuInstanceRequestAdapter:_emwgpuInstanceRequestAdapter,emwgpuQueueOnSubmittedWorkDone:_emwgpuQueueOnSubmittedWorkDone,emwgpuWaitAny:_emwgpuWaitAny,environ_get:_environ_get,environ_sizes_get:_environ_sizes_get,exit:_exit,fd_close:_fd_close,fd_read:_fd_read,fd_seek:_fd_seek,fd_write:_fd_write,memory:wasmMemory,random_get:_random_get,speechtest_flight_js,speechtest_flight_present_js,wgpuAdapterGetInfo:_wgpuAdapterGetInfo,wgpuAdapterGetLimits:_wgpuAdapterGetLimits,wgpuAdapterHasFeature:_wgpuAdapterHasFeature,wgpuBufferGetSize:_wgpuBufferGetSize,wgpuCommandEncoderBeginComputePass:_wgpuCommandEncoderBeginComputePass,wgpuCommandEncoderCopyBufferToBuffer:_wgpuCommandEncoderCopyBufferToBuffer,wgpuCommandEncoderFinish:_wgpuCommandEncoderFinish,wgpuComputePassEncoderDispatchWorkgroups:_wgpuComputePassEncoderDispatchWorkgroups,wgpuComputePassEncoderEnd:_wgpuComputePassEncoderEnd,wgpuComputePassEncoderSetBindGroup:_wgpuComputePassEncoderSetBindGroup,wgpuComputePassEncoderSetPipeline:_wgpuComputePassEncoderSetPipeline,wgpuComputePipelineGetBindGroupLayout:_wgpuComputePipelineGetBindGroupLayout,wgpuDeviceCreateBindGroup:_wgpuDeviceCreateBindGroup,wgpuDeviceCreateCommandEncoder:_wgpuDeviceCreateCommandEncoder,wgpuDeviceCreateComputePipeline:_wgpuDeviceCreateComputePipeline,wgpuInstanceHasWGSLLanguageFeature:_wgpuInstanceHasWGSLLanguageFeature,wgpuQueueSubmit:_wgpuQueueSubmit,wgpuQueueWriteBuffer:_wgpuQueueWriteBuffer}}function applySignatureConversions(wasmExports){wasmExports=Object.assign({},wasmExports);var makeWrapper_pp=f=>a0=>Number(f(BigInt(a0)));var makeWrapper__p=f=>a0=>f(BigInt(a0));var makeWrapper___PP=f=>(a0,a1,a2)=>f(a0,BigInt(a1?a1:0),BigInt(a2?a2:0));var makeWrapper_p=f=>()=>Number(f());var makeWrapper_ppp=f=>(a0,a1)=>Number(f(BigInt(a0),BigInt(a1)));var makeWrapper__p_____=f=>(a0,a1,a2,a3,a4,a5)=>f(BigInt(a0),a1,a2,a3,a4,a5);var makeWrapper___p_p_=f=>(a0,a1,a2,a3,a4)=>f(a0,BigInt(a1),a2,BigInt(a3),a4);var makeWrapper__pp=f=>(a0,a1)=>f(BigInt(a0),BigInt(a1));wasmExports[\"malloc\"]=makeWrapper_pp(wasmExports[\"malloc\"]);wasmExports[\"free\"]=makeWrapper__p(wasmExports[\"free\"]);wasmExports[\"main\"]=makeWrapper___PP(wasmExports[\"main\"]);wasmExports[\"pthread_self\"]=makeWrapper_p(wasmExports[\"pthread_self\"]);wasmExports[\"emscripten_builtin_memalign\"]=makeWrapper_ppp(wasmExports[\"emscripten_builtin_memalign\"]);wasmExports[\"_emscripten_thread_init\"]=makeWrapper__p_____(wasmExports[\"_emscripten_thread_init\"]);wasmExports[\"_emscripten_run_js_on_main_thread\"]=makeWrapper___p_p_(wasmExports[\"_emscripten_run_js_on_main_thread\"]);wasmExports[\"_emscripten_thread_free_data\"]=makeWrapper__p(wasmExports[\"_emscripten_thread_free_data\"]);wasmExports[\"_emscripten_thread_exit\"]=makeWrapper__p(wasmExports[\"_emscripten_thread_exit\"]);wasmExports[\"memalign\"]=makeWrapper_ppp(wasmExports[\"memalign\"]);wasmExports[\"emscripten_stack_set_limits\"]=makeWrapper__pp(wasmExports[\"emscripten_stack_set_limits\"]);wasmExports[\"_emscripten_stack_restore\"]=makeWrapper__p(wasmExports[\"_emscripten_stack_restore\"]);wasmExports[\"_emscripten_stack_alloc\"]=makeWrapper_pp(wasmExports[\"_emscripten_stack_alloc\"]);wasmExports[\"emscripten_stack_get_current\"]=makeWrapper_p(wasmExports[\"emscripten_stack_get_current\"]);return wasmExports}async function callMain(){var entryFunction=_main;var argc=0;var argv=0;try{var ret=entryFunction(argc,BigInt(argv));ret=await ret;exitJS(ret,true);return ret}catch(e){return handleException(e)}}function run(){if(runDependencies>0){dependenciesFulfilled=run;return}if(ENVIRONMENT_IS_PTHREAD){initRuntime();return}preRun();if(runDependencies>0){dependenciesFulfilled=run;return}async function doRun(){Module[\"calledRun\"]=true;if(ABORT)return;initRuntime();preMain();Module[\"onRuntimeInitialized\"]?.();var noInitialRun=Module[\"noInitialRun\"]||false;if(!noInitialRun)await callMain();postRun()}if(Module[\"setStatus\"]){Module[\"setStatus\"](\"Running...\");setTimeout(()=>{setTimeout(()=>Module[\"setStatus\"](\"\"),1);doRun()},1)}else{doRun()}}var wasmExports;if(!ENVIRONMENT_IS_PTHREAD){createWasm();run()}\n";
var FILE_READ_REQ_EVENT = "fs.read_req";
var JSPI_STUB = `
if (!WebAssembly.Suspending) {
  // JSPI not available - stubs that keep the import/export tables valid.
  // Suspending wraps imports: identity is fine since async imports won't be called.
  WebAssembly.Suspending = function (fn) {
    // console.log(fn.toString());
    return fn;
  };
  // promising wraps exports: must return a Promise so ccall's ret.then() works.
  WebAssembly.promising = function (fn) {
    return function (...args) {
      try {
        return Promise.resolve(fn(...args));
      } catch (e) {
        return Promise.reject(e);
      }
    };
  };
}
`;
var ProxyToWorker = class {
  // filename -> Blob for async reads
  constructor(resources, nbThread, suppressNativeLog, logger, modelOwnerWorkerFactory = null) {
    __publicField(this, "resources");
    __publicField(this, "logger");
    __publicField(this, "suppressNativeLog");
    __publicField(this, "taskQueue", []);
    __publicField(this, "taskId", 1);
    __publicField(this, "resultQueue", []);
    __publicField(this, "busy", false);
    __publicField(this, "worker");
    __publicField(this, "multiThread");
    __publicField(this, "nbThread");
    __publicField(this, "useAsyncFile");
    __publicField(this, "fileBlobs", /* @__PURE__ */ new Map());
    __publicField(this, "modelSourceReleased", false);
    __publicField(this, "lateSourceReadCount", 0);
    __publicField(this, "fileReadCount", 0);
    __publicField(this, "lastFileReadAt", 0);
    __publicField(this, "progressiveSourceRelease", false);
    __publicField(this, "fileReadState", /* @__PURE__ */ new Map());
    __publicField(this, "fileOrder", []);
    __publicField(this, "progressiveReleases", []);
    __publicField(this, "reopenSourceFile", null);
    __publicField(this, "onLedgerRecord", null);
    __publicField(this, "onLifecycle", null);
    __publicField(this, "recycleWindowBytes", 0);
    __publicField(this, "offloadTiedEmbedding", false);
    __publicField(this, "flightRecorder", false);
    __publicField(this, "flightRunId", null);
    __publicField(this, "modelOwnerWorkerFactory", null);
    __publicField(this, "workerOwnedExternally", false);
    __publicField(this, "nativeExitAcknowledged", false);
    this.resources = resources;
    this.nbThread = nbThread;
    this.multiThread = nbThread > 0;
    this.logger = logger;
    this.suppressNativeLog = suppressNativeLog;
    this.useAsyncFile = canUseAsyncFileRead(resources.compat);
    this.modelOwnerWorkerFactory = modelOwnerWorkerFactory;
  }
  noteReadForProgressiveRelease(name, offset, size) {
    // Progressive source release. Construction on the phone dies from a
    // transient: the full retained source plus the weights loaded so far.
    // The loader consumes split files broadly in order, so once a file is
    // fully covered by reads and a later file has begun, its blob can be
    // dropped - bounding the transient to remaining-source plus loaded
    // weights. If the loader ever re-reads a released file the read fails
    // loudly above, which is the safety proof; nothing degrades silently.
    const state = this.fileReadState.get(name);
    if (!state) return;
    state.started = true;
    if (offset + size > state.highWater) state.highWater = offset + size;
    const readerIndex = this.fileOrder.indexOf(name);
    for (let index = 0; index < readerIndex; index += 1) {
      const earlierName = this.fileOrder[index];
      const earlier = this.fileReadState.get(earlierName);
      if (!earlier || earlier.released || earlier.highWater < earlier.size) continue;
      const earlierBlob = this.fileBlobs.get(earlierName);
      if (!earlierBlob) continue;
      this.fileBlobs.delete(earlierName);
      earlier.released = true;
      this.progressiveReleases.push({ name: earlierName, bytes: earlierBlob.size, at: Date.now() });
    }
  }
  flightSourceSnapshot(currentName) {
    // Per-read numeric snapshot for the construction worker's journal.
    // Cheap on purpose: at most ~13 live handles, no arrays retained.
    let openLogical = 0; let touched = 0; let ordinal = 0; let i = 0;
    const recycleWindow = this.recycleWindowBytes || 96 * 1024 * 1024;
    for (const [name, blob] of this.fileBlobs) {
      i += 1;
      openLogical += blob.size;
      const st = this.fileReadState.get(name);
      const gen = st ? st.generationBytesRead || 0 : blob.size;
      touched += Math.min(blob.size, this.reopenSourceFile ? recycleWindow : blob.size, gen);
      if (name === currentName) ordinal = i;
    }
    return { openLogicalBytes: openLogical, touchedUpperBytes: touched, fileOrdinal: ordinal };
  }
  getModelSourceStats() {
    // Consultant correction 2026-08-25: on the async-file path the source
    // stays as OPFS-backed Blob/File handles - their summed .size is the
    // LOGICAL bytes addressable through live handles, not resident RAM and
    // not bytes inside Wasm. The old name retainedBytes invited exactly
    // that misreading (observed: 1.2 GB "retained" during a successful
    // seat). sourceTouchedUpperBytes is the hypothesis-driven upper bound
    // that belongs in pressure envelopes instead: per live handle,
    // min(fileSize, recycleWindow, bytesServedThisHandleGeneration).
    const recycleWindow = this.recycleWindowBytes || 96 * 1024 * 1024;
    let touchedUpper = 0;
    for (const [name, blob] of this.fileBlobs) {
      const st = this.fileReadState.get(name);
      const gen = st ? st.generationBytesRead || 0 : blob.size;
      touchedUpper += Math.min(blob.size, this.reopenSourceFile ? recycleWindow : blob.size, gen);
    }
    return {
      files: this.fileBlobs.size,
      sourceMode: "ASYNC_FILE",
      sourceHandleLogicalBytes: Array.from(this.fileBlobs.values()).reduce(
        (total, blob) => total + blob.size,
        0
      ),
      sourceTouchedUpperBytes: touchedUpper,
      readCount: this.fileReadCount,
      lastReadAt: this.lastFileReadAt,
      progressive: this.progressiveSourceRelease,
      lateReadCount: this.lateSourceReadCount,
      progressiveReleases: this.progressiveReleases.slice(),
      fileCensus: Array.from(this.fileReadState.entries()).map(([name, c]) => ({ name, size: c.size, reads: c.reads || 0, bytesRead: c.bytesRead || 0, highWater: c.highWater, rereadsAfterFull: c.rereadsAfterFull || 0, released: c.released === true }))
    };
  }
  getModelSourceCounters() {
    // The numeric half of getModelSourceStats, with no per-file arrays built.
    // Product boot needs only these counters for its ready receipt, and it
    // reads them at the most memory-fragile moment the application has, so it
    // should not materialise a census nothing consumes. Same figures, same
    // meanings - logical handle bytes, never resident RAM.
    const recycleWindow = this.recycleWindowBytes || 96 * 1024 * 1024;
    let touchedUpper = 0;
    let logical = 0;
    for (const [name, blob] of this.fileBlobs) {
      const st = this.fileReadState.get(name);
      const gen = st ? st.generationBytesRead || 0 : blob.size;
      touchedUpper += Math.min(blob.size, this.reopenSourceFile ? recycleWindow : blob.size, gen);
      logical += blob.size;
    }
    return {
      files: this.fileBlobs.size,
      sourceMode: "ASYNC_FILE",
      sourceHandleLogicalBytes: logical,
      sourceTouchedUpperBytes: touchedUpper,
      readCount: this.fileReadCount,
      lastReadAt: this.lastFileReadAt,
      progressive: this.progressiveSourceRelease,
      lateReadCount: this.lateSourceReadCount
    };
  }
  releaseModelSource() {
    this.fileBlobs.clear();
    this.reopenSourceFile = null;
    this.modelSourceReleased = true;
    return this.getModelSourceStats();
  }
  getModuleCode() {
    return __async(this, null, function* () {
      if (!this.resources.jsPath) {
        if (this.resources.compat) {
          throw new Error(
            "compat mode is enabled but no jsPath was provided. Pass a worker JS via setCompat() or install @wllama/wllama-compat."
          );
        }
        return WLLAMA_EMSCRIPTEN_CODE;
      } else if (this.resources.jsPath.code) {
        return this.resources.jsPath.code;
      } else if (isString(this.resources.jsPath)) {
        const response = yield fetch(this.resources.jsPath);
        if (!response.ok) {
          throw new Error(
            `Failed to fetch worker code from ${this.resources.jsPath}`
          );
        }
        return yield response.text();
      } else {
        throw new Error("No JS code provided for worker");
      }
    });
  }
  moduleInit(ggufFiles, policy = {}) {
    return __async(this, null, function* () {
      const allowedInitialMemoryMiB = /* @__PURE__ */ new Set([96, 112, 128, 160]);
      const initialMemoryMiB = this.initialMemoryMiB || 128;
      if (!allowedInitialMemoryMiB.has(initialMemoryMiB)) {
        throw new Error(`Unsupported initial memory: ${initialMemoryMiB} MiB`);
      }
      const checkpointClearPolicy = policy.checkpointClearPolicy;
      if (checkpointClearPolicy !== void 0 && checkpointClearPolicy !== "replace-on-reset-and-terminate") {
        throw new Error("Unsupported checkpoint clear policy");
      }
      let moduleCode = JSPI_STUB + (yield this.getModuleCode());
      let mainModuleCode = moduleCode.replace("var Module", "var ___Module");
      // The phone flight-v1h ring crossed the outer load-action wrapper but
      // never entered wllama_action's Wasm body. Fence the only silent code in
      // between: Emscripten ccall entry, completed argument marshaling, and
      // the exact promising-export call made by ccall.
      // These anchors exist once in both the default and compatibility
      // modules; fail closed if a future Emscripten output changes shape.
      const ccallEntryAnchor = "var func=getCFunc(ident);var cArgs=[];var stack=0;";
      const ccallInvokeAnchor = "var ret=func(...cArgs);";
      if (mainModuleCode.split(ccallEntryAnchor).length !== 2 || mainModuleCode.split(ccallInvokeAnchor).length !== 2) {
        throw new Error("flight-ccall-anchor-mismatch");
      }
      mainModuleCode = mainModuleCode
        .replace(
          ccallEntryAnchor,
          `${ccallEntryAnchor}var __stLoadCcall=ident==="wllama_action"&&args&&args[0]==="load"&&self.__flight;if(__stLoadCcall)self.__flight.nativeCheckpoint(2,20,1,0,0,0,0,0,0,0,0,0,0);`
        )
        .replace(
          ccallInvokeAnchor,
          `if(__stLoadCcall)self.__flight.nativeCheckpoint(2,21,1,0,0,0,0,0,0,0,0,0,0);if(__stLoadCcall)self.__flight.nativeCheckpoint(2,22,1,0,0,0,0,0,0,0,0,0,0);var ret=func(...cArgs);if(__stLoadCcall)self.__flight.nativeCheckpoint(2,23,2,0,0,0,0,0,0,0,0,0,0);`
        );
      const runOptions = {
        pathConfig: {
          "wllama.wasm": this.resources.wasmPath
        },
        nbThread: this.nbThread,
        compat: this.resources.compat,
        initialMemoryMiB,
        checkpointClearPolicy: checkpointClearPolicy != null
          ? checkpointClearPolicy
          : "replace-on-reset-and-terminate"
      };
      const lifecycleWorkerCode = LLAMA_CPP_WORKER_CODE
        .replace(
          "          Module.ENV['USE_ASYNC_FILE'] = '1';\n        }\n",
          "          Module.ENV['USE_ASYNC_FILE'] = '1';\n        }\n        Module.ENV['WLLAMA_CHECKPOINT_CLEAR_POLICY'] = RUN_OPTIONS.checkpointClearPolicy;\n"
        )
        .replace(
          "let minBytes = 128 * 1024 * 1024;",
          "const requestedInitialMiB = Number(RUN_OPTIONS.initialMemoryMiB || 128);\n  if (![96, 112, 128, 160].includes(requestedInitialMiB)) throw new Error('Unsupported initial memory: ' + requestedInitialMiB + ' MiB');\n  let minBytes = requestedInitialMiB * 1024 * 1024;"
        )
        .replace(
          "let pendingReadReject = null;",
          "let pendingReadReject = null;\nself.__speechtestModelSourceState = 'available';\nself.__speechtestModelSourceReleaseResolve = null;\nself.__speechtestModelSourceReleaseReject = null;"
        )
        .replace(
          "const _wllama_js_file_read = async (path, offset, req_size, out_ptr) => {",
          "const _wllama_js_file_read = async (path, offset, req_size, out_ptr) => {\n  if (self.__speechtestModelSourceState !== 'available') throw new Error('model source read after ' + self.__speechtestModelSourceState);"
        )
        .replace(
          "  // Guard: while awaiting a file read, reject any other incoming task.",
          "  if (verb === 'model.source_released') {\n    if (self.__speechtestModelSourceReleaseResolve) self.__speechtestModelSourceReleaseResolve(args && args[0]);\n    return;\n  }\n\n  // Guard: while awaiting a file read, reject any other incoming task."
        )
        .replace(
          "if (verb === 'module.init') {\n",
          "if (verb === 'module.init') {\n    msg({ verb: 'runtime.lifecycle', args: ['module-init-received', null] });\n"
        )
        .replace(
          "Module = getWModuleConfig(argMainScriptBlob);\n",
          "Module = getWModuleConfig(argMainScriptBlob);\n      msg({ verb: 'runtime.lifecycle', args: ['module-configured', null] });\n"
        )
        .replace(
          "Module.onRuntimeInitialized = () => {\n",
          "Module.onRuntimeInitialized = () => {\n        msg({ verb: 'runtime.lifecycle', args: ['module-runtime-initialized', null] });\n"
        )
        .replace(
          "      wModuleInit();\n    } catch (err) {",
          "      msg({ verb: 'runtime.lifecycle', args: ['wasm-init-called', null] });\n      wModuleInit();\n    } catch (err) {\n      msg({ verb: 'runtime.lifecycle', args: ['module-init-threw', { name: err?.name || null, message: err?.message || String(err) }] });"
        )
        // Phone v172 p1-p3 rings all stop after Wasm runtime initialization
        // and before native CONSTRUCTION_BEGIN. Fence the previously silent
        // glue path without adding page telemetry or changing the Wasm binary.
        .replace(
          "        __stPrevORI();\n      };",
          "        __stPrevORI();\n        if (self.__flight) self.__flight.nativeCheckpoint(2, 12, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);\n      };"
        )
        .replace(
          "    try {\n      // create blank file",
          "    try {\n      if (self.__flight) self.__flight.nativeCheckpoint(2, 13, 1, currFileId + 1, currFileId + 1, argSize, 0, 0, 0, 0, 0, 0, 0);\n      // create blank file"
        )
        .replace(
          "      const fileId = heapfsAlloc(argFilename, argSize, argAllocBuffer);\n      msg({ callbackId, result: { fileId } });",
          "      const fileId = heapfsAlloc(argFilename, argSize, argAllocBuffer);\n      if (self.__flight) self.__flight.nativeCheckpoint(2, 13, 2, fileId + 1, fileId + 1, argSize, argAllocBuffer ? argSize : 0, argSize, 0, 0, 0, 0, 0);\n      msg({ callbackId, result: { fileId } });"
        )
        .replace(
          "    try {\n      const result = await wllamaStart();\n      msg({ callbackId, result });",
          "    try {\n      if (self.__flight) self.__flight.nativeCheckpoint(2, 14, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);\n      const result = await wllamaStart();\n      if (self.__flight) self.__flight.nativeCheckpoint(2, 14, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);\n      msg({ callbackId, result });"
        )
        .replace(
          "    try {\n      const inputPtr = await wllamaMalloc(toSizeT(argEncodedMsg.byteLength), 0);",
          "    try {\n      if (argAction === 'load' && self.__flight) self.__flight.nativeCheckpoint(2, 15, 1, 0, 0, argEncodedMsg.byteLength, 0, 0, 0, 0, 0, 0, 0);\n      const inputPtr = await wllamaMalloc(toSizeT(argEncodedMsg.byteLength), 0);"
        )
        .replace(
          "      inputBuffer.set(argEncodedMsg, 0);\n      const outputPtr = await wllamaAction(argAction, inputPtr);",
          "      inputBuffer.set(argEncodedMsg, 0);\n      if (argAction === 'load' && self.__flight) self.__flight.nativeCheckpoint(2, 15, 2, 0, 0, argEncodedMsg.byteLength, argEncodedMsg.byteLength, 0, 0, 0, 0, 0, 0);\n      const outputPtr = await wllamaAction(argAction, inputPtr);"
        )
        .replace(
          "    let result;\n    try {\n      if (args.length === 2) {\n        result = isAsync ? await fn(action, req) : fn(action, req);",
          "    let result;\n    const __stLoadAction = name === 'wllama_action' && action === 'load' && self.__flight;\n    if (__stLoadAction) self.__flight.nativeCheckpoint(2, 16, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);\n    try {\n      if (args.length === 2) {\n        result = isAsync ? await fn(action, req) : fn(action, req);"
        )
        // Native MODEL_READY to page MODEL_READY (Packet L, L1). The ring
        // stopped at the native checkpoint; the worker still had to allocate a
        // JS output buffer the size of the load result and post it. Fence both,
        // load action only, so a decode does not flood 4096 slots.
        .replace(
          "      // copy the output buffer to JS heap\n      const outputBuffer = new Uint8Array(outputLen);",
          "      if (argAction === 'load' && self.__flight) self.__flight.nativeCheckpoint(2, 24, 1, 0, 0, outputLen, 0, 0, 0, 0, 0, 0, 0);\n      // copy the output buffer to JS heap\n      const outputBuffer = new Uint8Array(outputLen);"
        )
        .replace(
          "      msg({ callbackId, result: outputBuffer }, [outputBuffer.buffer]);",
          "      if (argAction === 'load' && self.__flight) self.__flight.nativeCheckpoint(2, 25, 1, 0, 0, outputLen, outputLen, 0, 0, 0, 0, 0, 0);\n      msg({ callbackId, result: outputBuffer }, [outputBuffer.buffer]);"
        );
      const completeCode = [
        `const RUN_OPTIONS = ${JSON.stringify(runOptions)};`,
        `function wModuleInit() { ${mainModuleCode}; return Module; }`,
        lifecycleWorkerCode
      ].join(";\n\n");
      this.worker = this.modelOwnerWorkerFactory
        ? yield this.modelOwnerWorkerFactory(completeCode)
        : createWorker(completeCode);
      this.workerOwnedExternally = Boolean(this.modelOwnerWorkerFactory);
      this.worker.onmessage = this.onRecvMsg.bind(this);
      this.worker.onerror = this.logger.error;
      const res = yield this.pushTask({
        verb: "module.init",
        args: [
          new Blob([moduleCode], { type: "text/javascript" }),
          this.useAsyncFile,
          this.offloadTiedEmbedding === true,
          this.flightRecorder === true,
          this.flightRunId || null,
          this.uploadIntervalMiB || null,
          this.ballastPreMiB || null,
          this.initialMemoryMiB || null,
          this.marginCanaryMiB || null
        ],
        callbackId: this.taskId++
      });
      const nativeFiles = [];
      for (const file of ggufFiles) {
        const needAllocBuffer = !this.useAsyncFile;
        const id = yield this.fileAlloc(
          file.name,
          file.blob.size,
          needAllocBuffer
        );
        nativeFiles.push(__spreadValues({ id }, file));
        if (this.useAsyncFile) {
          this.fileBlobs.set(file.name, file.blob);
          this.fileOrder.push(file.name);
          this.fileReadState.set(file.name, { size: file.blob.size, highWater: 0, started: false, released: false, generation: 1, generationBytesRead: 0 });
        }
      }
      if (!this.useAsyncFile) {
        yield Promise.all(
          nativeFiles.map((file) => {
            return this.fileWrite(file.id, file.blob);
          })
        );
      }
      return res;
    });
  }
  wllamaStart() {
    return __async(this, null, function* () {
      const result = yield this.pushTask({
        verb: "wllama.start",
        args: [],
        callbackId: this.taskId++
      });
      const parsedResult = this.parseResult(result);
      return parsedResult;
    });
  }
  wllamaAction(name, body) {
    return __async(this, null, function* () {
      const encodedMsg = glueSerialize(body);
      const result = yield this.pushTask({
        verb: "wllama.action",
        args: [name, encodedMsg],
        callbackId: this.taskId++
      });
      // Page-side boundary of the load round trip. The worker's ring stops at
      // the postMessage; between that and a parsed load result the page copies
      // and GLUE-decodes the payload, and nothing observed that window.
      if (name === "load") {
        this.onLifecycle?.({ phase: "load-worker-result-received", details: { bytes: result?.byteLength ?? null } });
        this.onLifecycle?.({ phase: "load-glue-deserialize-pre", details: { bytes: result?.byteLength ?? null } });
      }
      const parsedResult = glueDeserialize(result);
      if (name === "load") this.onLifecycle?.({ phase: "load-glue-deserialize-post", details: { success: parsedResult?.success === true } });
      return parsedResult;
    });
  }
  flightMark(phase, op, edge, value, error) {
    return this.pushTask({ verb: "flight.mark", args: [phase, op, edge, value || 0, error || 0], callbackId: this.taskId++ });
  }
  wllamaExit() {
    return __async(this, null, function* () {
      if (this.worker) {
        if (this.workerOwnedExternally) {
          if (!this.nativeExitAcknowledged) {
            yield this.pushTask({ verb: "wllama.exit", args: [], callbackId: this.taskId++ });
            this.nativeExitAcknowledged = true;
          }
          this.worker = null;
        } else {
          this.worker.terminate();
        }
      }
    });
  }
  wllamaDebug() {
    return __async(this, null, function* () {
      const result = yield this.pushTask({
        verb: "wllama.debug",
        args: [],
        callbackId: this.taskId++
      });
      return JSON.parse(result);
    });
  }
  wllamaMemory() {
    return __async(this, null, function* () {
      return yield this.pushTask({
        verb: "wllama.memory",
        args: [],
        callbackId: this.taskId++
      });
    });
  }
  ///////////////////////////////////////
  /**
   * Allocate a new file in heapfs
   * @returns fileId, to be used by fileWrite()
   */
  fileAlloc(fileName, size, allocBuffer) {
    return __async(this, null, function* () {
      const result = yield this.pushTask({
        verb: "fs.alloc",
        args: [fileName, size, allocBuffer],
        callbackId: this.taskId++
      });
      return result.fileId;
    });
  }
  /**
   * Write a Blob to heapfs
   */
  fileWrite(fileId, blob) {
    return __async(this, null, function* () {
      const reader = blob.stream().getReader();
      let offset = 0;
      while (true) {
        const { done, value } = yield reader.read();
        if (done) break;
        const size = value.byteLength;
        yield this.pushTask(
          {
            verb: "fs.write",
            args: [fileId, value, offset],
            callbackId: this.taskId++
          },
          // @ts-ignore Type 'ArrayBufferLike' is not assignable to type 'ArrayBuffer'
          [value.buffer]
        );
        offset += size;
      }
    });
  }
  fileReadResponse(name, offset, size) {
    return __async(this, null, function* () {
      var _a;
      try {
        if (this.modelSourceReleased) {
          this.lateSourceReadCount += 1;
          throw new Error("model source read requested after MODEL_SOURCE_RELEASED");
        }
        this.fileReadCount += 1;
        this.lastFileReadAt = Date.now();
        const census = this.fileReadState.get(name);
        if (census) {
          census.reads = (census.reads || 0) + 1;
          census.bytesRead = (census.bytesRead || 0) + size;
          if (census.highWater >= census.size && size > 0) census.rereadsAfterFull = (census.rereadsAfterFull || 0) + 1;
          if (offset + size > census.highWater) census.highWater = offset + size;
        }
        let blob = this.fileBlobs.get(name);
        if (!blob && this.progressiveSourceRelease && this.reopenSourceFile) {
          // The loader re-read a file after its progressive release - the
          // access pattern is not strictly sequential (observed live:
          // model-00001 re-read after later files began). Recover by
          // re-opening from the disk cache, re-retain, and record the
          // violation so qualification sees how often prediction failed.
          blob = yield this.reopenSourceFile(name);
          if (blob) {
            this.fileBlobs.set(name, blob);
            const state = this.fileReadState.get(name);
            if (state) state.released = false;
            this.progressiveReleases.push({ name, reopened: true, at: Date.now() });
          }
        }
        if (!blob) {
          // No recovery path: fail loudly rather than serve from anywhere else.
          throw new Error(`blob not found for name="${name}"`);
        }
        if (this.progressiveSourceRelease) {
          this.noteReadForProgressiveRelease(name, offset, size);
          // The OPFS backend hands out disk-backed File objects, but WebKit
          // pins the pages read through a live File in the WebContent
          // process, so retention cost grows with bytes read regardless of
          // file layout - releasing only at file boundaries arrives too late
          // when logical files are large (observed: qwen dead at read ~40
          // with the full source still pinned). Recycling the handle every
          // 96 MiB read lets the pinned cache go continuously.
          const readState = this.fileReadState.get(name);
          if (readState) readState.generationBytesRead = (readState.generationBytesRead || 0) + size;
          if (readState && this.reopenSourceFile) {
            readState.servedSinceRecycle = (readState.servedSinceRecycle || 0) + size;
            if (readState.servedSinceRecycle >= (this.recycleWindowBytes || 96 * 1024 * 1024)) {
              readState.servedSinceRecycle = 0;
              this.fileBlobs.delete(name);
              const recycled = yield this.reopenSourceFile(name);
              if (recycled) {
                this.fileBlobs.set(name, recycled);
                readState.generation = (readState.generation || 1) + 1;
                readState.generationBytesRead = 0;
                this.progressiveReleases.push({ name, recycled: true, at: Date.now() });
              }
            }
          }
        }
        const chunk = blob.slice(offset, offset + size);
        const buffer = yield chunk.arrayBuffer();
        this.worker.postMessage(
          { verb: "fs.read_res", args: [buffer, this.flightSourceSnapshot(name)] },
          { transfer: [buffer] }
        );
      } catch (err) {
        this.logger.error("fileReadResponse failed, terminating worker:", err);
        (_a = this.worker) == null ? void 0 : _a.terminate();
        this.worker = void 0;
        this.abort(`File read failed: ${err}`, err.stack || "");
      }
    });
  }
  /**
   * Parse JSON result returned by cpp code.
   * Throw new Error if "__exception" is present in the response
   *
   * TODO: get rid of this function once everything is migrated to Glue
   */
  parseResult(result) {
    const parsedResult = JSON.parse(result);
    if (parsedResult && parsedResult["error"]) {
      throw new WllamaRuntimeError("Unknown error, please see console.log", "");
    }
    return parsedResult;
  }
  /**
   * Push a new task to taskQueue
   */
  pushTask(param, buffers) {
    return new Promise((resolve, reject) => {
      this.taskQueue.push({ resolve, reject, param, buffers });
      this.runTaskLoop();
    });
  }
  /**
   * Main loop for processing tasks
   */
  runTaskLoop() {
    return __async(this, null, function* () {
      var _a;
      if (this.busy) {
        return;
      }
      this.busy = true;
      while (true) {
        const task = this.taskQueue.shift();
        if (!task) break;
        this.resultQueue.push(task);
        this.worker.postMessage(
          task.param,
          isSafariMobile() ? void 0 : {
            transfer: (_a = task.buffers) != null ? _a : []
          }
        );
      }
      this.busy = false;
    });
  }
  /**
   * Handle messages from worker
   */
  onRecvMsg(e) {
    if (!e.data) return;
    const { verb, args } = e.data;
    const isCompatBuild = this.resources.compat;
    if (verb === "ledger") {
      // Structured measurement channel: raw stderr-prefixed records routed
      // around log-level filtering and console line mangling entirely.
      try { this.onLedgerRecord?.(JSON.parse(args[0])); } catch { this.onLedgerRecord?.({ event: "unparsed", raw: String(args[0]).slice(0, 400) }); }
      return;
    }
    if (verb === "runtime.lifecycle") {
      this.onLifecycle?.({ phase: args[0], details: args[1] || null });
      return;
    }
    if (verb === "model.source_consumed") {
      const before = this.getModelSourceCounters();
      const filesReleased = this.fileBlobs.size;
      let logicalBytesReleased = 0;
      for (const blob of this.fileBlobs.values()) logicalBytesReleased += blob.size;
      this.fileBlobs.clear();
      this.reopenSourceFile = null;
      this.modelSourceReleased = true;
      for (const state of this.fileReadState.values()) state.released = true;
      const after = this.getModelSourceCounters();
      const receipt = {
        event: "model_source_proxy_released",
        schemaVersion: 2,
        supported: true,
        releaseDisposition: "released-now",
        releaseAttempted: true,
        releasePerformedNow: true,
        nativeProxyReleaseAcknowledged: true,
        filesBefore: before.files,
        filesAfter: after.files,
        logicalBytesBefore: before.sourceHandleLogicalBytes,
        logicalBytesAfter: after.sourceHandleLogicalBytes,
        touchedUpperBefore: before.sourceTouchedUpperBytes,
        touchedUpperAfter: after.sourceTouchedUpperBytes,
        lateReadCount: after.lateReadCount,
        invariantSatisfied: after.files === 0 && after.sourceHandleLogicalBytes === 0 && after.lateReadCount === 0,
        filesReleased,
        logicalBytesReleased,
        laterSourceReadsFailClosed: true
      };
      // The retained-v1m worker import predates SourceReleaseReceipt and its
      // private transport acknowledgment intentionally remains the one-field
      // schema-1 wire: `released === true`. Stage 20 accidentally sent the
      // public schema-2 receipt on that private wire, so compat rejected the
      // acknowledgment and left the suspended load action pending forever.
      //
      // Keep the contracts separate. Native receives the minimal attestation
      // it was built to consume; observers receive the exact Packet-Q receipt
      // with no legacy boolean added to it. Queue the native acknowledgment
      // first so telemetry can never sit on the construction critical path.
      const nativeReleaseAck = {
        schemaVersion: 1,
        released: receipt.invariantSatisfied === true
      };
      this.worker?.postMessage({ verb: "model.source_released", args: [nativeReleaseAck] });
      if (this.onLedgerRecord) this.onLedgerRecord(receipt);
      return;
    }
    if (verb && verb.startsWith("console.")) {
      if (this.suppressNativeLog) {
        return;
      }
      if (verb.endsWith("debug")) this.logger.debug(...args);
      if (verb.endsWith("log")) this.logger.log(...args);
      if (verb.endsWith("warn")) this.logger.warn(...args);
      if (verb.endsWith("error")) this.logger.error(...args);
      return;
    } else if (verb === "signal.abort") {
      const [signalType, message, rawStack, originalErr] = args;
      if (originalErr) {
        this.logger.error(originalErr);
      }
      (() => __async(this, null, function* () {
        let stack = "";
        let newMsg = (typeof message === "string" ? message : message?.message || String(message || "Unknown worker error")).replace(
          "Build with -sASSERTIONS for more info.",
          ""
        );
        if (signalType === "abort") {
          newMsg = `(ABORT) ${newMsg}`;
          stack = (typeof rawStack === "string" ? rawStack : rawStack?.stack || String(rawStack || "")).replace(/\|/g, "\n");
        } else if (signalType === "exception") {
          stack = rawStack;
        }
        const decoded = yield Debug.decodeStackTrace(stack, isCompatBuild);
        this.logger.error(`Stack trace (${signalType}):
` + decoded);
        this.abort(newMsg, decoded);
      }))();
      return;
    }
    if (verb === FILE_READ_REQ_EVENT) {
      const [name, offset, size] = args;
      this.fileReadResponse(name, offset, size).catch(() => {
      });
      return;
    }
    const { callbackId, result, err } = e.data;
    if (callbackId) {
      const idx = this.resultQueue.findIndex(
        (t) => t.param.callbackId === callbackId
      );
      if (idx !== -1) {
        const waitingTask = this.resultQueue.splice(idx, 1)[0];
        if (err) waitingTask.reject(err);
        else waitingTask.resolve(result);
      } else {
        this.logger.error(
          `Cannot find waiting task with callbackId = ${callbackId}`
        );
      }
    }
  }
  abort(text, stack) {
    const error = new WllamaRuntimeError(
      text.length == 0 ? "(unknown error)" : text,
      stack
    );
    while (this.resultQueue.length > 0) {
      const waitingTask = this.resultQueue.pop();
      if (!waitingTask) break;
      waitingTask.reject(error);
    }
    while (this.taskQueue.length > 0) {
      const pendingTask = this.taskQueue.pop();
      if (!pendingTask) break;
      pendingTask.reject(error);
    }
  }
};
var HF_BASE = "https://huggingface.co";
var DEFAULT_QUANTS = ["Q4_K_M", "Q8_0"];
function fetchRepoFiles(repo, token) {
  return __async(this, null, function* () {
    var _a;
    const url = `${HF_BASE}/api/models/${repo}/tree/main?recursive=true`;
    const headers = { Accept: "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const res = yield fetch(url, { headers });
    if (!res.ok) {
      let msg = res.statusText;
      try {
        msg = (_a = (yield res.json()).error) != null ? _a : msg;
      } catch (e) {
      }
      throw new Error(`HF API error (${res.status}): ${msg}`);
    }
    return res.json();
  });
}
function firstShardPath(files, path) {
  const m = path.match(/^(.+)-(\d{5})-of-(\d{5})\.gguf$/i);
  if (!m) return path;
  const first = `${m[1]}-00001-of-${m[3]}.gguf`;
  return files.some((f) => f.path === first) ? first : path;
}
function selectFile(files, quant, mmprojOnly) {
  const candidates = files.filter((f) => {
    if (f.type !== "file" || !f.path.toLowerCase().endsWith(".gguf"))
      return false;
    const ismmproj = f.path.toLowerCase().includes("mmproj");
    return mmprojOnly ? ismmproj : !ismmproj;
  });
  if (candidates.length === 0) return null;
  if (quant) {
    const upper = quant.toUpperCase();
    const match = candidates.find((f) => f.path.toUpperCase().includes(upper));
    if (match) return firstShardPath(candidates, match.path);
    return null;
  }
  for (const q of DEFAULT_QUANTS) {
    const match = candidates.find((f) => f.path.toUpperCase().includes(q));
    if (match) return firstShardPath(candidates, match.path);
  }
  return firstShardPath(candidates, candidates[0].path);
}
function getHFModelSource(config) {
  return __async(this, null, function* () {
    const { repo, file, quant, mmprojFile, mmprojQuant, hfToken } = config;
    const files = yield fetchRepoFiles(repo, hfToken);
    const modelPath = file != null ? file : selectFile(files, quant, false);
    if (!modelPath) {
      throw new Error(`No GGUF file found in repo "${repo}"`);
    }
    const source = {
      url: `${HF_BASE}/${repo}/resolve/main/${modelPath}`
    };
    if (mmprojFile || mmprojQuant !== void 0) {
      const mmpath = mmprojFile != null ? mmprojFile : selectFile(files, mmprojQuant, true);
      if (mmpath) {
        source.mmprojUrl = `${HF_BASE}/${repo}/resolve/main/${mmpath}`;
      }
    }
    if (hfToken) {
      const params = new URLSearchParams({ token: hfToken });
      source.url += `?${params}`;
      if (source.mmprojUrl) {
        source.mmprojUrl += `?${params}`;
      }
    }
    return source;
  });
}
function getHFFileSHA256(url, headers) {
  return __async(this, null, function* () {
    if (!url.includes("/resolve/")) return void 0;
    const rawUrl = url.replace("/resolve/", "/raw/");
    try {
      const text = yield fetch(rawUrl, { headers }).then((r) => r.text());
      const match = text.match(/^oid sha256:([0-9a-f]{64})$/m);
      return match ? match[1] : void 0;
    } catch (e) {
      return void 0;
    }
  });
}
var OPFSBackend = class {
  isSupported() {
    var _a;
    return typeof navigator !== "undefined" && "storage" in navigator && !!((_a = navigator.storage) == null ? void 0 : _a.getDirectory);
  }
  read(key) {
    return __async(this, null, function* () {
      try {
        const cacheDir = yield getCacheDir();
        const fileHandle = yield cacheDir.getFileHandle(key);
        return yield fileHandle.getFile();
      } catch (e) {
        return null;
      }
    });
  }
  write(key, stream) {
    return __async(this, null, function* () {
      const writable = yield openWritable(key);
      yield writable.truncate(0);
      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = yield reader.read();
          if (done) break;
          yield writable.write(value);
        }
      } finally {
        yield writable.close();
      }
    });
  }
  getSize(key) {
    return __async(this, null, function* () {
      try {
        const cacheDir = yield getCacheDir();
        const fileHandle = yield cacheDir.getFileHandle(key);
        const file = yield fileHandle.getFile();
        return file.size;
      } catch (e) {
        return -1;
      }
    });
  }
  list() {
    return __async(this, null, function* () {
      const cacheDir = yield getCacheDir();
      const result = [];
      try {
        for (var iter = __forAwait(cacheDir.entries()), more, temp, error; more = !(temp = yield iter.next()).done; more = false) {
          const [name, handle] = temp.value;
          if (handle.kind === "file") {
            const file = yield handle.getFile();
            result.push({ key: name, size: file.size });
          }
        }
      } catch (temp2) {
        error = [temp2];
      } finally {
        try {
          more && (temp = iter.return) && (yield temp.call(iter));
        } finally {
          if (error)
            throw error[0];
        }
      }
      return result;
    });
  }
  delete(key) {
    return __async(this, null, function* () {
      try {
        const cacheDir = yield getCacheDir();
        yield cacheDir.removeEntry(key);
      } catch (e) {
        if ((e == null ? void 0 : e.name) !== "NotFoundError") throw e;
      }
    });
  }
};
function getCacheDir() {
  return __async(this, null, function* () {
    const opfsRoot = yield navigator.storage.getDirectory();
    return opfsRoot.getDirectoryHandle("cache", { create: true });
  });
}
function openWritable(fileName) {
  return __async(this, null, function* () {
    const worker = createWorker(OPFS_UTILS_WORKER_CODE);
    let pResolve;
    let pReject;
    worker.onmessage = (e) => {
      if (e.data.ok) pResolve(null);
      else if (e.data.err) pReject(e.data.err);
    };
    worker.onerror = (e) => {
      var _a;
      return pReject == null ? void 0 : pReject((_a = e.message) != null ? _a : e);
    };
    const workerExec = (data) => new Promise((resolve, reject) => {
      pResolve = resolve;
      pReject = reject;
      worker.postMessage(
        data,
        isSafariMobile() ? void 0 : { transfer: "buf" in data && data.buf ? [data.buf.buffer] : [] }
      );
    });
    yield workerExec({ action: "open", filename: fileName });
    return {
      truncate: () => __async(this, null, function* () {
      }),
      write: (value) => workerExec({ action: "write", buf: value }),
      close: () => __async(this, null, function* () {
        yield workerExec({ action: "close" });
        worker.terminate();
      })
    };
  });
}
function makeHash(key) {
  return { algorithm: "SHA-256", value: key };
}
var COSInternalBackend = class {
  isSupported() {
    return typeof navigator !== "undefined" && "crossOriginStorage" in navigator;
  }
  // IMPORTANT: key must be SHA-256 hash of the data
  read(key) {
    return __async(this, null, function* () {
      try {
        const handle = yield navigator.crossOriginStorage.requestFileHandle(
          makeHash(key)
        );
        return handle.getFile();
      } catch (e) {
        return null;
      }
    });
  }
  // IMPORTANT: key must be SHA-256 hash of the data
  write(key, stream) {
    return __async(this, null, function* () {
      const handle = yield navigator.crossOriginStorage.requestFileHandle(
        makeHash(key),
        { create: true }
      );
      const writable = yield handle.createWritable();
      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = yield reader.read();
          if (done) break;
          yield writable.write(value);
        }
      } finally {
        yield writable.close();
      }
    });
  }
  // IMPORTANT: key must be SHA-256 hash of the data
  getSize(key) {
    return __async(this, null, function* () {
      try {
        const handle = yield navigator.crossOriginStorage.requestFileHandle(
          makeHash(key)
        );
        const file = yield handle.getFile();
        return file.size;
      } catch (e) {
        return -1;
      }
    });
  }
  list() {
    return __async(this, null, function* () {
      throw new Error("not implemented");
    });
  }
  delete(_key) {
    return __async(this, null, function* () {
      throw new Error("not implemented");
    });
  }
};
var COSBackend = class {
  constructor() {
    __publicField(this, "cos", new COSInternalBackend());
    __publicField(this, "priv", new OPFSBackend());
  }
  isSupported() {
    return this.priv.isSupported();
  }
  read(key, hint) {
    return __async(this, null, function* () {
      if ((hint == null ? void 0 : hint.sha256) && this.cos.isSupported()) {
        const blob = yield this.cos.read(hint.sha256);
        if (blob) return blob;
      }
      return this.priv.read(key);
    });
  }
  write(key, stream, hint) {
    return __async(this, null, function* () {
      if ((hint == null ? void 0 : hint.sha256) && this.cos.isSupported()) {
        yield this.cos.write(hint.sha256, stream);
      } else {
        yield this.priv.write(key, stream);
      }
    });
  }
  getSize(key, hint) {
    return __async(this, null, function* () {
      if ((hint == null ? void 0 : hint.sha256) && this.cos.isSupported()) {
        const size = yield this.cos.getSize(hint.sha256);
        if (size !== -1) return size;
      }
      return this.priv.getSize(key);
    });
  }
  list() {
    return __async(this, null, function* () {
      return this.priv.list();
    });
  }
  delete(key) {
    return __async(this, null, function* () {
      return this.priv.delete(key);
    });
  }
};
var PREFIX_METADATA = "__metadata__";
var POLYFILL_ETAG = "polyfill_for_older_version";
function hintFromMetadata(metadata) {
  if (!metadata) return void 0;
  if (metadata.sha256) return { sha256: metadata.sha256 };
  return void 0;
}
var CacheManager = class {
  /**
   * @param backends Array of storage backends to use, in order of preference ; if first is available, use it, otherwise try the next one.
   */
  constructor(backends = [new COSBackend()]) {
    __publicField(this, "sb");
    for (const backend of backends) {
      if (backend.isSupported()) {
        this.sb = backend;
        return;
      }
    }
    throw new Error("No supported storage backend found");
  }
  /**
   * Convert a given URL into a storage key.
   *
   * Format: `${hashSHA1(fullURL)}_${fileName}`
   */
  getNameFromURL(url) {
    return __async(this, null, function* () {
      return urlToFileName(url, "");
    });
  }
  /**
   * @deprecated Use `download()` instead
   *
   * Write a new file to cache. This will overwrite existing file.
   *
   * @param name The file name returned by `getNameFromURL()` or `list()`
   */
  write(name, stream, metadata) {
    return __async(this, null, function* () {
      yield this.sb.write(name, stream);
      yield this.writeMetadata(name, metadata);
    });
  }
  download(_0) {
    return __async(this, arguments, function* (url, options = {}) {
      var _a, _b, _c;
      const fileKey = yield urlToFileName(url, "");
      const sha256 = yield getHFFileSHA256(url, (_a = options.headers) != null ? _a : {});
      const hint = sha256 ? { sha256 } : void 0;
      if (hint && (yield this.sb.getSize(fileKey, hint)) !== -1) {
        if (!(yield this.getMetadata(fileKey))) {
          const head = yield fetch(url, __spreadValues({
            method: "HEAD"
          }, options.headers ? { headers: options.headers } : {}));
          const contentLength2 = head.headers.get("content-length");
          const etag2 = (head.headers.get("etag") || "").replace(
            /[^A-Za-z0-9]/g,
            ""
          );
          yield this.writeMetadata(fileKey, __spreadValues({
            originalURL: url,
            originalSize: parseInt(contentLength2 != null ? contentLength2 : "0", 10),
            etag: etag2,
            sha256
          }, (_b = options.metadataAdditional) != null ? _b : {}));
        }
        return;
      }
      const response = yield fetch(url, __spreadValues(__spreadValues({}, options.headers ? { headers: options.headers } : {}), options.signal ? { signal: options.signal } : {}));
      if (!response.ok || !response.body) {
        throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
      }
      const contentLength = response.headers.get("content-length");
      const etag = (response.headers.get("etag") || "").replace(
        /[^A-Za-z0-9]/g,
        ""
      );
      const total = parseInt(contentLength != null ? contentLength : "0", 10);
      const progressCallback = options.progressCallback;
      let loaded = 0;
      let lastProgressAt = 0;
      const progressStream = new TransformStream({
        transform(chunk, controller2) {
          loaded += chunk.byteLength;
          if (progressCallback) {
            const now = Date.now();
            if (now - lastProgressAt > 100) {
              lastProgressAt = now;
              progressCallback({ loaded, total });
            }
          }
          controller2.enqueue(chunk);
        },
        flush() {
          progressCallback == null ? void 0 : progressCallback({ loaded, total: total || loaded });
        }
      });
      const metadata = __spreadValues({
        originalURL: url,
        originalSize: total,
        etag
      }, (_c = options.metadataAdditional) != null ? _c : {});
      if (sha256) {
        metadata.sha256 = sha256;
      }
      yield this.sb.write(
        fileKey,
        response.body.pipeThrough(progressStream),
        hint
      );
      yield this.writeMetadata(fileKey, metadata);
    });
  }
  /**
   * Open a file in cache for reading
   *
   * @param nameOrURL The file name returned by `getNameFromURL()` or `list()`, or the original URL of the remote file
   * @returns Blob, or null if file does not exist
   */
  open(nameOrURL) {
    return __async(this, null, function* () {
      const hint1 = hintFromMetadata(yield this.getMetadata(nameOrURL));
      const direct = yield this.sb.read(nameOrURL, hint1);
      if (direct) return direct;
      const key = yield urlToFileName(nameOrURL, "");
      const hint2 = hintFromMetadata(yield this.getMetadata(key));
      return this.sb.read(key, hint2);
    });
  }
  /**
   * Get the size of a file in stored cache
   *
   * NOTE: in case the download is stopped mid-way (i.e. user close browser tab), the file maybe corrupted, size maybe different from `metadata.originalSize`
   *
   * @param name The file name returned by `getNameFromURL()` or `list()`
   * @returns number of bytes, or -1 if file does not exist
   */
  getSize(name) {
    return __async(this, null, function* () {
      const hint = hintFromMetadata(yield this.getMetadata(name));
      return this.sb.getSize(name, hint);
    });
  }
  /**
   * Get metadata of a cached file
   */
  getMetadata(name) {
    return __async(this, null, function* () {
      const blob = yield this.sb.read(`${PREFIX_METADATA}${name}`);
      const cachedSize = yield this.sb.getSize(name);
      if (!blob) {
        return cachedSize > 0 ? (
          // files created by older version of wllama don't have metadata; polyfill it
          {
            etag: POLYFILL_ETAG,
            originalSize: cachedSize,
            originalURL: ""
          }
        ) : (
          // cached file not found
          null
        );
      }
      try {
        return yield new Response(blob).json();
      } catch (e) {
        return null;
      }
    });
  }
  /**
   * List all files currently in cache
   */
  list() {
    return __async(this, null, function* () {
      const all = yield this.sb.list();
      const metadataMap = {};
      for (const { key } of all) {
        if (key.startsWith(PREFIX_METADATA)) {
          const blob = yield this.sb.read(key);
          if (blob) {
            const meta = yield new Response(blob).json().catch(() => null);
            metadataMap[key.slice(PREFIX_METADATA.length)] = meta;
          }
        }
      }
      const result = [];
      for (const { key, size } of all) {
        if (!key.startsWith(PREFIX_METADATA)) {
          result.push({
            name: key,
            size,
            metadata: metadataMap[key] || {
              originalSize: size,
              originalURL: "",
              etag: ""
            }
          });
        }
      }
      return result;
    });
  }
  /**
   * Clear all files currently in cache
   */
  clear() {
    return __async(this, null, function* () {
      yield this.deleteMany(() => true);
    });
  }
  /**
   * Delete a single file in cache
   *
   * @param nameOrURL Can be either an URL or a name returned by `getNameFromURL()` or `list()`
   */
  delete(nameOrURL) {
    return __async(this, null, function* () {
      const name2 = yield this.getNameFromURL(nameOrURL);
      yield this.deleteMany(
        (entry) => entry.name === nameOrURL || entry.name === name2
      );
    });
  }
  /**
   * Delete multiple files in cache.
   *
   * @param predicate A predicate like `array.filter(item => boolean)`
   */
  deleteMany(predicate) {
    return __async(this, null, function* () {
      const list = yield this.list();
      for (const item of list) {
        if (predicate(item)) {
          yield this.sb.delete(item.name);
          yield this.sb.delete(`${PREFIX_METADATA}${item.name}`);
        }
      }
    });
  }
  /**
   * Write the metadata of the file to disk.
   */
  writeMetadata(name, metadata) {
    return __async(this, null, function* () {
      const blob = new Blob([JSON.stringify(metadata)], { type: "text/plain" });
      yield this.sb.write(`${PREFIX_METADATA}${name}`, blob.stream());
    });
  }
};
var cache_manager_default = CacheManager;
function urlToFileName(url, prefix) {
  return __async(this, null, function* () {
    const hashBuffer = yield crypto.subtle.digest(
      "SHA-1",
      new TextEncoder().encode(url)
    );
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${prefix}${hashHex}_${url.split("/").pop()}`;
  });
}
var DEFAULT_PARALLEL_DOWNLOADS = 3;
var Model = class {
  constructor(modelManager2, url, mmprojUrl, savedFiles) {
    __publicField(this, "modelManager");
    __publicField(this, "url");
    __publicField(this, "mmprojUrl");
    __publicField(this, "size");
    __publicField(this, "files");
    this.modelManager = modelManager2;
    this.url = url;
    this.mmprojUrl = mmprojUrl;
    if (savedFiles) {
      this.files = this.getAllFiles(savedFiles);
      this.size = sumArr(this.files.map((f) => f.metadata.originalSize));
    } else {
      this.files = [];
      this.size = 0;
    }
  }
  /**
   * Open and get a list of all shards as Blobs
   */
  open() {
    return __async(this, null, function* () {
      if (this.size === -1) {
        throw new WllamaError(
          `Model is deleted from the cache; Call ModelManager.downloadModel to re-download the model`,
          "load_error"
        );
      }
      const blobs = [];
      for (const file of this.files) {
        const blob = yield this.modelManager.cacheManager.open(file.name);
        if (!blob) {
          throw new Error(
            `Failed to open file ${file.name}; Hint: the model may be invalid, please refresh it`
          );
        }
        blobs.push(blob);
      }
      return blobs;
    });
  }
  /**
   * Validate the model files.
   *
   * If the model is invalid, the model manager will not be able to use it. You must call `refresh` to re-download the model.
   *
   * Cases that model is invalid:
   * - The model is deleted from the cache
   * - The model files are missing (or the download is interrupted)
   */
  validate() {
    let nbShards = ModelManager.parseModelUrl(this.url).length;
    if (this.mmprojUrl) {
      nbShards += 1;
    }
    if (this.size === -1) {
      return "deleted";
    }
    if (this.size < 16 || this.files.length !== nbShards) {
      return "invalid";
    }
    for (const file of this.files) {
      if (!file.metadata || file.metadata.originalSize !== file.size) {
        return "invalid";
      }
    }
    return "valid";
  }
  /**
   * In case the model is invalid, call this function to re-download the model
   */
  refresh() {
    return __async(this, arguments, function* (options = {}) {
      var _a;
      const urls = ModelManager.parseModelUrl(this.url);
      if (this.mmprojUrl) {
        urls.push(this.mmprojUrl);
      }
      const works = urls.map((url, index) => ({
        url,
        index
      }));
      this.modelManager.logger.debug("Downloading model files:", urls);
      const nParallel = (_a = this.modelManager.params.parallelDownloads) != null ? _a : DEFAULT_PARALLEL_DOWNLOADS;
      const totalSize = yield this.getTotalDownloadSize(urls);
      const loadedSize = [];
      const worker = () => __async(this, null, function* () {
        while (works.length > 0) {
          const w = works.shift();
          if (!w) break;
          yield this.modelManager.cacheManager.download(w.url, __spreadProps(__spreadValues({}, options), {
            metadataAdditional: {
              originalURL: w.url,
              mmprojURL: this.mmprojUrl
            },
            progressCallback: ({ loaded }) => {
              var _a2;
              loadedSize[w.index] = loaded;
              (_a2 = options.progressCallback) == null ? void 0 : _a2.call(options, {
                loaded: sumArr(loadedSize),
                total: totalSize
              });
            }
          }));
        }
      });
      const promises = [];
      for (let i = 0; i < nParallel; i++) {
        promises.push(worker());
        loadedSize.push(0);
      }
      yield Promise.all(promises);
      this.files = this.getAllFiles(yield this.modelManager.cacheManager.list());
      this.size = this.files.reduce((acc, f) => acc + f.metadata.originalSize, 0);
    });
  }
  /**
   * Remove the model from the cache
   */
  remove() {
    return __async(this, null, function* () {
      this.files = this.getAllFiles(yield this.modelManager.cacheManager.list());
      yield this.modelManager.cacheManager.deleteMany(
        (f) => !!this.files.find((file) => file.name === f.name)
      );
      this.size = -1;
    });
  }
  getAllFiles(savedFiles) {
    const allUrls = new Set(ModelManager.parseModelUrl(this.url));
    if (this.mmprojUrl) {
      allUrls.add(this.mmprojUrl);
    }
    const allFiles = [];
    for (const url of allUrls) {
      const file = savedFiles.find((f) => f.metadata.originalURL === url);
      if (!file) {
        throw new Error(`Model file not found: ${url}`);
      }
      allFiles.push(file);
    }
    allFiles.sort(
      (a, b) => a.metadata.originalURL.localeCompare(b.metadata.originalURL)
    );
    return allFiles;
  }
  getTotalDownloadSize(urls) {
    return __async(this, null, function* () {
      const responses = yield Promise.all(
        urls.map((url) => fetch(url, { method: "HEAD" }))
      );
      const sizes = responses.map(
        (res) => Number(res.headers.get("content-length") || "0")
      );
      return sumArr(sizes);
    });
  }
};
var ModelManager = class _ModelManager {
  constructor(params = {}) {
    __publicField(this, "cacheManager");
    __publicField(this, "params");
    __publicField(this, "logger");
    this.cacheManager = params.cacheManager || new cache_manager_default();
    this.params = params;
    this.logger = params.logger || console;
  }
  /**
   * Parses a model URL and returns an array of URLs based on the following patterns:
   * - If the input URL is an array, it returns the array itself.
   * - If the input URL is a string in the `gguf-split` format, it returns an array containing the URL of each shard in ascending order.
   * - Otherwise, it returns an array containing the input URL as a single element array.
   * @param modelUrl URL or list of URLs
   */
  static parseModelUrl(modelUrl) {
    var _a;
    if (Array.isArray(modelUrl)) {
      return modelUrl;
    }
    const urlPartsRegex = /-(\d{5})-of-(\d{5})\.gguf(?:\?.*)?$/;
    const queryMatch = modelUrl.match(/\.gguf(\?.*)?$/);
    const queryParams = (_a = queryMatch == null ? void 0 : queryMatch[1]) != null ? _a : "";
    const matches = modelUrl.match(urlPartsRegex);
    if (!matches) {
      return [modelUrl];
    }
    const baseURL = modelUrl.replace(urlPartsRegex, "");
    const total = matches[2];
    const paddedShardIds = Array.from(
      { length: Number(total) },
      (_, index) => (index + 1).toString().padStart(5, "0")
    );
    return paddedShardIds.map(
      (current) => `${baseURL}-${current}-of-${total}.gguf${queryParams}`
    );
  }
  /**
   * Get all models in the cache
   */
  getModels() {
    return __async(this, arguments, function* (opts = {}) {
      const cachedFiles = yield this.cacheManager.list();
      let models = [];
      for (const file of cachedFiles) {
        const shards = _ModelManager.parseModelUrl(file.metadata.originalURL);
        const mmprojUrl = file.metadata.mmprojURL;
        const isFirstShard = shards.length === 1 || shards[0] === file.metadata.originalURL;
        if (isFirstShard) {
          models.push(
            new Model(this, file.metadata.originalURL, mmprojUrl, cachedFiles)
          );
        }
      }
      if (!opts.includeInvalid) {
        models = models.filter(
          (m) => m.validate() === "valid"
          /* VALID */
        );
      }
      return models;
    });
  }
  /**
   * Download a model from the given URL.
   *
   * The URL must end with `.gguf`
   */
  downloadModel(_0) {
    return __async(this, arguments, function* (sourceOrURL, options = {}) {
      const source = isString(sourceOrURL) ? { url: sourceOrURL } : sourceOrURL;
      if (!isValidGgufFile(source.url)) {
        throw new WllamaError(
          `Invalid model URL: ${source.url}; URL must ends with ".gguf"`,
          "download_error"
        );
      }
      const model = new Model(this, source.url, source.mmprojUrl);
      const validity = model.validate();
      if (validity !== "valid") {
        yield model.refresh(options);
      }
      return model;
    });
  }
  /**
   * Get a model from the cache or download it if it's not available.
   */
  getModelOrDownload(_0) {
    return __async(this, arguments, function* (source, options = {}) {
      var _a;
      const models = yield this.getModels();
      const model = models.find((m) => m.url === source.url);
      if (model) {
        (_a = options.progressCallback) == null ? void 0 : _a.call(options, { loaded: model.size, total: model.size });
        return model;
      }
      return this.downloadModel(source, options);
    });
  }
  /**
   * Remove all models from the cache
   */
  clear() {
    return __async(this, null, function* () {
      yield this.cacheManager.clear();
    });
  }
};
var WasmCompatFromCDN = {
  worker: "https://cdn.jsdelivr.net/npm/@wllama/wllama-compat@3.5.1/wasm/wllama.js",
  wasm: "https://cdn.jsdelivr.net/npm/@wllama/wllama-compat@3.5.1/wasm/wllama.wasm"
};
var LoggerWithoutDebug = __spreadProps(__spreadValues({}, console), {
  debug: () => {
  }
});
var WllamaError = class extends Error {
  constructor(message, type = "unknown_error") {
    super(message);
    __publicField(this, "type");
    this.type = type;
  }
};
var WllamaAbortError = class extends Error {
  constructor() {
    super("Operation aborted");
    __publicField(this, "name", "AbortError");
  }
};
var WllamaRuntimeError = class extends Error {
  constructor(message, stack) {
    super(message);
    __publicField(this, "name", "RuntimeError");
    __publicField(this, "stack");
    this.stack = stack;
  }
};
export var Wllama = class {
  constructor(pathConfig, wllamaConfig = {}) {
    __publicField(this, "cacheManager");
    __publicField(this, "modelManager");
    __publicField(this, "compat", null);
    __publicField(this, "proxy", null);
    __publicField(this, "config");
    __publicField(this, "pathConfig");
    __publicField(this, "useMultiThread", false);
    __publicField(this, "nbThreads", 1);
    __publicField(this, "useEmbeddings", false);
    __publicField(this, "useRerank", false);
    __publicField(this, "loadedContextInfo", null);
    __publicField(this, "seed");
    __publicField(this, "bosToken", -1);
    __publicField(this, "eosToken", -1);
    __publicField(this, "eotToken", -1);
    __publicField(this, "eogTokens", /* @__PURE__ */ new Set());
    __publicField(this, "addBosToken", false);
    __publicField(this, "addEosToken", false);
    __publicField(this, "mediaMarker");
    __publicField(this, "chatTemplate");
    __publicField(this, "metadata");
    __publicField(this, "hasEncoder", false);
    __publicField(this, "decoderStartToken", -1);
    __publicField(this, "lastGenerationDiagnostics", null);
    __publicField(this, "chatTemplateKwargs", {});
    var _a, _b, _c;
    checkEnvironmentCompatible();
    if (!pathConfig) throw new WllamaError("AssetsPathConfig is required");
    this.pathConfig = pathConfig;
    this.config = wllamaConfig;
    this.cacheManager = (_a = wllamaConfig.cacheManager) != null ? _a : new cache_manager_default();
    this.modelManager = (_c = wllamaConfig.modelManager) != null ? _c : new ModelManager({
      cacheManager: this.cacheManager,
      logger: (_b = wllamaConfig.logger) != null ? _b : console,
      parallelDownloads: wllamaConfig.parallelDownloads,
      allowOffline: wllamaConfig.allowOffline
    });
    this.setCompat("default");
  }
  logger() {
    var _a;
    return (_a = this.config.logger) != null ? _a : console;
  }
  checkModelLoaded() {
    if (!this.isModelLoaded()) {
      throw new WllamaError(
        "loadModel() is not yet called",
        "model_not_loaded"
      );
    }
  }
  /**
   * Get the libllama version string, e.g. "b6327-4d74393".
   *
   * @returns version string embedded at build time.
   */
  static getLibllamaVersion() {
    return LIBLLAMA_VERSION;
  }
  /**
   * Set compatibility options for Wllama.
   * @param compat Set to null to disable compatibility, or 'default' to use the default compat resources from CDN.
   * @param mode 'safari' by default; If set to 'firefox_safari', the compat mode will **also** be enabled on Firefox, which will significantly degrade the performance but allow using WebGPU on Firefox.
   */
  setCompat(compat, mode = "safari") {
    if (mode === "safari") {
      if (isFirefox()) {
        this.compat = null;
        return;
      }
    }
    this.compat = compat === "default" ? WasmCompatFromCDN : compat;
  }
  /**
   * Check if the model is loaded via `loadModel()`
   */
  /**
   * Opt in to per-file source release during construction: each split file
   * blob is dropped once fully consumed and a later file has begun, bounding
   * the construction transient to remaining-source plus loaded weights. Must
   * be called before loadModel. A read against a released file fails loudly.
   */
  /**
   * Place the tied token-embedding/output matrix on the GPU backend so the
   * duplicated output request aliases the original tensor instead of
   * allocating a second cross-backend copy. Consultant directive release 2.
   */
  /** Register a listener for structured LEDGER channel records. */
  setLedgerListener(listener) {
    this._ledgerListener = listener;
    if (this.proxy) this.proxy.onLedgerRecord = listener;
  }
  /** Register sparse worker/module lifecycle diagnostics. */
  setLifecycleListener(listener) {
    this._lifecycleListener = listener;
    if (this.proxy) this.proxy.onLifecycle = listener;
  }
  setFlightKnobs(options = {}) {
    // Phase-3/4 knobs (plan of record): touched-Wasm ballast dose and the
    // upload-drain interval as runtime values - one binary, one variable.
    this._uploadIntervalMiB = options.uploadIntervalMiB || null;
    this._ballastPreMiB = options.ballastPreMiB || null;
    this._initialMemoryMiB = options.initialMemoryMiB || null;
    this._marginCanaryMiB = options.marginCanaryMiB || null;
    if (this.proxy) { this.proxy.uploadIntervalMiB = this._uploadIntervalMiB; this.proxy.ballastPreMiB = this._ballastPreMiB; this.proxy.initialMemoryMiB = this._initialMemoryMiB; this.proxy.marginCanaryMiB = this._marginCanaryMiB; }
  }
  flightMark(phase, op, edge, value, error) {
    return this.proxy ? this.proxy.flightMark(phase, op, edge, value, error) : Promise.resolve(false);
  }
  enableFlightRecorder(runIdBytes) {
    // Plan of record 2026-08-25: the worker opens the OPFS journal before
    // module init; the page ships only the enable flag and the raw run id.
    this._flightRecorder = true;
    this._flightRunId = runIdBytes || null;
    if (this.proxy) { this.proxy.flightRecorder = true; this.proxy.flightRunId = this._flightRunId; }
  }
  enableTiedEmbeddingOffload(options = {}) {
    this._offloadTiedEmbedding = true;
    // Binaries older than measure-v2 do not know the offload_tied_embedding
    // glue field and fail load-request parsing with "Length out of range of
    // buffer" when it is serialized. Legacy mode keeps the module-ENV
    // carrier (which those binaries do honor) and suppresses the field.
    this._tiedSchemaField = options.schemaField !== false;
    if (this.proxy) this.proxy.offloadTiedEmbedding = true;
  }
  enableProgressiveSourceRelease(options = {}) {
    this._progressiveSourceRelease = true;
    this._recycleWindowBytes = options.recycleWindowBytes || 0;
    if (this.proxy) {
      this.proxy.progressiveSourceRelease = true;
      this.proxy.recycleWindowBytes = this._recycleWindowBytes;
    }
  }
  /** Report source Blobs retained by the compatibility async-file reader. */
  getModelSourceStats() {
    var _a, _b;
    return (_b = (_a = this.proxy) == null ? void 0 : _a.getModelSourceStats()) != null ? _b : {
      files: 0,
      sourceMode: "ASYNC_FILE",
      sourceHandleLogicalBytes: 0,
      sourceTouchedUpperBytes: 0,
      readCount: 0,
      lastReadAt: 0,
      lateReadCount: 0
    };
  }
  /** Report the numeric source counters only, without building a file census. */
  getModelSourceCounters() {
    var _a, _b;
    return (_b = (_a = this.proxy) == null ? void 0 : _a.getModelSourceCounters()) != null ? _b : {
      files: 0,
      sourceMode: "ASYNC_FILE",
      sourceHandleLogicalBytes: 0,
      sourceTouchedUpperBytes: 0,
      readCount: 0,
      lastReadAt: 0,
      lateReadCount: 0
    };
  }
  /**
   * Release compatibility-reader model Blobs after the caller has proved that
   * the loaded model no longer performs source reads.
   */
  releaseModelSource() {
    var _a, _b;
    return (_b = (_a = this.proxy) == null ? void 0 : _a.releaseModelSource()) != null ? _b : this.getModelSourceStats();
  }
  isModelLoaded() {
    return !!this.proxy && !!this.metadata;
  }
  /**
   * Get token ID associated to BOS (begin of sentence) token.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns -1 if the model is not loaded.
   */
  getBOS() {
    return this.bosToken;
  }
  /**
   * Get token ID associated to EOS (end of sentence) token.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns -1 if the model is not loaded.
   */
  getEOS() {
    return this.eosToken;
  }
  /**
   * Get token ID associated to EOT (end of turn) token.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns -1 if the model is not loaded.
   */
  getEOT() {
    return this.eotToken;
  }
  /**
   * Check if a given token is end-of-generation token (e.g. EOS, EOT, etc.)
   *
   * @param token the token ID to be checked
   * @returns true if the token is EOS, EOT, or any other end-of-generation tokens
   */
  isTokenEOG(token) {
    return token === this.eosToken || token === this.eotToken || this.eogTokens.has(token);
  }
  /**
   * Get token ID associated to token used by decoder, to start generating output sequence(only usable for encoder-decoder architecture). In other words, encoder uses normal BOS and decoder uses this token.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns -1 if the model is not loaded.
   */
  getDecoderStartToken() {
    return this.decoderStartToken;
  }
  /**
   * Get model hyper-parameters and metadata
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns ModelMetadata
   */
  getModelMetadata() {
    this.checkModelLoaded();
    return this.metadata;
  }
  /**
   * Check if we're currently using multi-thread build.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns true if multi-thread is used.
   */
  isMultithread() {
    this.checkModelLoaded();
    return this.useMultiThread;
  }
  /**
   * Get number of threads used in the current context.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns number of threads
   */
  getNumThreads() {
    this.checkModelLoaded();
    return this.useMultiThread ? this.nbThreads : 1;
  }
  /**
   * Check if the current model uses encoder-decoder architecture
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns true if multi-thread is used.
   */
  isEncoderDecoderArchitecture() {
    this.checkModelLoaded();
    return this.hasEncoder;
  }
  /**
   * Must we add BOS token to the tokenized sequence?
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns true if BOS token must be added to the sequence
   */
  mustAddBosToken() {
    this.checkModelLoaded();
    return this.addBosToken;
  }
  /**
   * Must we add EOS token to the tokenized sequence?
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns true if EOS token must be added to the sequence
   */
  mustAddEosToken() {
    this.checkModelLoaded();
    return this.addEosToken;
  }
  /**
   * Get the jinja chat template comes with the model. It only available if the original model (before converting to gguf) has the template in `tokenizer_config.json`
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns the jinja template. null if there is no template in gguf
   */
  getChatTemplate() {
    var _a;
    this.checkModelLoaded();
    return (_a = this.chatTemplate) != null ? _a : null;
  }
  /**
   * Check if WebGPU is supported by the current environment.
   * @returns true if WebGPU is supported
   */
  isSupportWebGPU() {
    return isSupportWebGPU();
  }
  /**
   * Load model from a given URL (or a list of URLs, in case the model is splitted into smaller files)
   * - If the model already been downloaded (via `downloadModel()`), then we will use the cached model
   * - Else, we download the model from internet
   * @param modelSourceOrURL
   * @param params
   */
  loadModelFromUrl(_0) {
    return __async(this, arguments, function* (modelSourceOrURL, params = {}) {
      var _a;
      const source = isString(modelSourceOrURL) ? { url: modelSourceOrURL } : modelSourceOrURL;
      const useCache = (_a = params.useCache) != null ? _a : true;
      let model = useCache ? yield this.modelManager.getModelOrDownload(source, params) : yield this.modelManager.downloadModel(source, params);
      const blobs = yield model.open();
      // Progressive-release recovery mapping: worker-side names are assigned
      // by prepareBlobs after a sort, so remember each blob object identity
      // against its cache key. A released file that the loader re-reads is
      // then re-opened from the disk cache instead of aborting the load.
      this._sourceBlobKeys = new Map(blobs.map((blob, index) => [blob, model.files[index]?.name]));
      this._sourceCacheManager = this.modelManager.cacheManager;
      const loadPromise = this.loadModel(blobs, params);
      blobs.length = 0;
      model = null;
      return yield loadPromise;
    });
  }
  /**
   * Load model from a given Hugging Face model ID and file path.
   *
   * @param hfOptions
   * @param params
   */
  loadModelFromHF(_0) {
    return __async(this, arguments, function* (hfOptions, params = {}) {
      const source = yield getHFModelSource(hfOptions);
      return yield this.loadModelFromUrl(source, params);
    });
  }
  /**
   * Load model from a given list of Blob.
   *
   * You can pass multiple buffers into the function (in case the model contains multiple shards).
   *
   * @param ggufBlobsOrModel Can be either list of Blobs (in case you use local file), or a Model object (in case you use ModelManager)
   * @param params LoadModelParams
   */
  loadModel(_0) {
    return __async(this, arguments, function* (ggufBlobsOrModel, params = {}) {
      var _a, _b, _c, _d, _e, _f, _g, _h;
      assertRuntimeWireSchema(this.config.expectedBuildId);
      const blobs = ggufBlobsOrModel instanceof Model ? yield ggufBlobsOrModel.open() : [...ggufBlobsOrModel];
      if (blobs.some((b) => b.size === 0)) {
        throw new WllamaError(
          "Input model (or splits) must be non-empty Blob or File",
          "load_error"
        );
      }
      if (!this.pathConfig["default"]) {
        throw new WllamaError(
          '"default" is missing from pathConfig',
          "load_error"
        );
      }
      if (this.proxy) {
        throw new WllamaError("Module is already initialized", "load_error");
      }
      const supportMultiThread = yield isSupportMultiThread();
      const hwConccurency = Math.floor((navigator.hardwareConcurrency || 1) / 2);
      const nbThreads = (_a = params.n_threads) != null ? _a : hwConccurency;
      this.nbThreads = nbThreads;
      this.useMultiThread = supportMultiThread && nbThreads > 1;
      const workerResources = this.getWorkerResources();
      this.proxy = new ProxyToWorker(
        workerResources,
        this.useMultiThread ? nbThreads : 0,
        // 0 means disable pthread
        (_b = this.config.suppressNativeLog) != null ? _b : false,
        this.logger(),
        this.config.modelOwnerWorkerFactory || null
      );
      this.proxy.progressiveSourceRelease = this._progressiveSourceRelease === true;
      this.proxy.recycleWindowBytes = this._recycleWindowBytes || 0;
      this.proxy.offloadTiedEmbedding = this._offloadTiedEmbedding === true;
      this.proxy.flightRecorder = this._flightRecorder === true;
      this.proxy.flightRunId = this._flightRunId || null;
      this.proxy.uploadIntervalMiB = this._uploadIntervalMiB || null;
      this.proxy.ballastPreMiB = this._ballastPreMiB || null;
      this.proxy.initialMemoryMiB = this._initialMemoryMiB || null;
      this.proxy.marginCanaryMiB = this._marginCanaryMiB || null;
      this.proxy.onLedgerRecord = this._ledgerListener || null;
      this.proxy.onLifecycle = this._lifecycleListener || null;
      let logLevel = (_c = params.log_level) != null ? _c : 2;
      if (this.config.suppressNativeLog) {
        logLevel = 9999;
      }
      const modelFiles = yield prepareBlobs(blobs);
      if (this._progressiveSourceRelease && this._sourceBlobKeys) {
        const workerNameToCacheKey = new Map();
        for (const file of modelFiles.all) {
          const cacheKey = this._sourceBlobKeys.get(file.blob);
          if (cacheKey) workerNameToCacheKey.set(file.name, cacheKey);
        }
        const cacheManager = this._sourceCacheManager;
        this.proxy.reopenSourceFile = (name) => {
          const cacheKey = workerNameToCacheKey.get(name);
          return cacheKey && cacheManager ? cacheManager.open(cacheKey) : Promise.resolve(null);
        };
      }
      const checkpointClearPolicy = (_c = params.checkpoint_clear_policy) != null
        ? _c
        : "replace-on-reset-and-terminate";
      yield this.proxy.moduleInit(modelFiles.all, { checkpointClearPolicy });
      this._sourceBlobKeys?.clear();
      this._sourceBlobKeys = null;
      this._sourceCacheManager = null;
      this.logger().debug("Calling wllamaStart...");
      const startResult = yield this.proxy.wllamaStart();
      if (!startResult.success) {
        throw new WllamaError(
          `Error while calling start function, result = ${startResult}`
        );
      }
      const modelPaths = modelFiles.llm.map((f) => `models/${f.name}`);
      const mmprojPath = modelFiles.mmproj ? `/models/${MMPROJ_FILE_NAME}` : void 0;
      modelFiles.all.length = 0;
      modelFiles.llm.length = 0;
      modelFiles.mmproj = null;
      blobs.length = 0;
      this.logger().debug("Loading model...");
      const loadResult = yield this.proxy.wllamaAction("load", {
        _name: "load_req",
        log_level: logLevel,
        // if async read is not supported, use mmap; refer to README-dev.md for more details
        use_mmap: !canUseAsyncFileRead(workerResources.compat),
        use_mlock: false,
        n_gpu_layers: (_d = params.n_gpu_layers) != null ? _d : 99999,
        n_ctx: (_e = params.n_ctx) != null ? _e : 1024,
        n_threads: this.useMultiThread ? nbThreads : 1,
        n_ctx_auto: false,
        // not supported for now
        mmproj_path: mmprojPath,
        model_paths: modelPaths,
        embeddings: params.embeddings,
        offload_kqv: params.offload_kqv,
        n_batch: params.n_batch,
        n_ubatch: params.n_ubatch,
        // Wave-2 request tail. Undefined here means a GLUE null on the wire,
        // which is what leaves the native defaults - and therefore every
        // allocation size and the whole probe schedule - exactly as before.
        n_outputs_max: params.n_outputs_max,
        pooling_type: params.pooling_type,
        rope_scaling_type: params.rope_scaling_type,
        rope_freq_base: params.rope_freq_base,
        rope_freq_scale: params.rope_freq_scale,
        yarn_ext_factor: params.yarn_ext_factor,
        yarn_attn_factor: params.yarn_attn_factor,
        yarn_beta_fast: params.yarn_beta_fast,
        yarn_beta_slow: params.yarn_beta_slow,
        yarn_orig_ctx: params.yarn_orig_ctx,
        cache_type_k: params.cache_type_k,
        cache_type_v: params.cache_type_v,
        n_parallel: 1,
        // only support single sequence for now
        kv_unified: false,
        // TODO: support kv unified cache
        flash_attn: params.flash_attn,
        // Applied after the lossy flash_attn boolean and therefore wins over
        // it: -1 auto (probe), 0 disabled, 1 enabled. Null leaves the boolean
        // path alone.
        flash_attn_policy: params.flash_attn_policy,
        fused_gdn_ar: params.fused_gdn_ar,
        fused_gdn_ch: params.fused_gdn_ch,
        fused_gdn_auto: params.fused_gdn_auto,
        sched_max_splits_hint: params.sched_max_splits_hint,
        n_ctx_checkpoints: (_d = params.ctx_checkpoints) != null ? _d : 1,
        checkpoint_min_step: (_e = params.checkpoint_every_n_tokens) != null ? _e : 256,
        swa_full: params.swa_full,
        chat_template: params.chat_template,
        jinja: params.jinja,
        reasoning: params.reasoning,
        image_min_tokens: params.image_min_tokens,
        image_max_tokens: params.image_max_tokens,
        warmup: params.warmup,
        no_kv_offload: params.no_kv_offload,
        mmproj_offload: params.mmproj_offload,
        cont_batching: params.cont_batching,
        n_keep: params.n_keep,
        ctx_shift: params.ctx_shift,
        cache_idle_slots: params.cache_idle_slots,
        n_cache_reuse: params.n_cache_reuse,
        lora_paths: (_f = params.lora_adapters) == null ? void 0 : _f.map((a) => a.path),
        lora_scales: (_g = params.lora_adapters) == null ? void 0 : _g.map((a) => {
          var _a2;
          return (_a2 = a.scale) != null ? _a2 : 1;
        }),
        lora_init_without_apply: params.lora_init_without_apply,
        spec_draft_model: params.spec_draft_model,
        spec_draft_ngl: params.spec_draft_ngl,
        spec_draft_n_max: params.spec_draft_n_max,
        spec_draft_n_min: params.spec_draft_n_min,
        spec_draft_p_min: params.spec_draft_p_min,
        spec_draft_threads: params.spec_draft_threads,
        spec_draft_threads_batch: params.spec_draft_threads_batch,
        kv_overrides_keys: params.kv_overrides ? Object.keys(params.kv_overrides) : void 0,
        kv_overrides_vals: params.kv_overrides ? Object.values(params.kv_overrides) : void 0,
        reasoning_budget_tokens: params.reasoning_budget_tokens,
        reasoning_budget_message: params.reasoning_budget_message,
        reasoning_format: params.reasoning_format,
        skip_chat_parsing: params.skip_chat_parsing,
        prefill_assistant: params.prefill_assistant
      });
      const loadedCtxInfo = __spreadProps(__spreadValues({}, loadResult), {
        metadata: {}
      });
      for (let i = 0; i < loadResult.metadata_key.length; i++) {
        loadedCtxInfo.metadata[loadResult.metadata_key[i]] = loadResult.metadata_val[i];
      }
      this.seed = params.seed;
      this.bosToken = loadedCtxInfo.token_bos;
      this.eosToken = loadedCtxInfo.token_eos;
      this.eotToken = loadedCtxInfo.token_eot;
      this.useEmbeddings = !!params.embeddings;
      this.useRerank = params.pooling_type == "rank";
      this.metadata = {
        hparams: {
          nVocab: loadedCtxInfo.n_vocab,
          nCtxTrain: loadedCtxInfo.n_ctx_train,
          nEmbd: loadedCtxInfo.n_embd,
          nLayer: loadedCtxInfo.n_layer
        },
        meta: loadedCtxInfo.metadata
      };
      this.hasEncoder = !!loadedCtxInfo.has_encoder;
      this.decoderStartToken = loadedCtxInfo.token_decoder_start;
      this.addBosToken = loadedCtxInfo.add_bos_token;
      this.addEosToken = loadedCtxInfo.add_eos_token;
      this.chatTemplate = loadedCtxInfo.metadata["tokenizer.chat_template"];
      this.loadedContextInfo = loadedCtxInfo;
      this.eogTokens = new Set(loadedCtxInfo.list_tokens_eog);
      this.mediaMarker = loadedCtxInfo.media_marker;
      this.chatTemplateKwargs = (_h = params.default_template_kwargs) != null ? _h : {};
      this.logger().debug({ loadedCtxInfo });
    });
  }
  getLoadedContextInfo() {
    this.checkModelLoaded();
    if (!this.loadedContextInfo) {
      throw new WllamaError("Loaded context info is not available");
    }
    return __spreadValues({}, this.loadedContextInfo);
  }
  /** Last terminal native receipt, separate from all OAI completion values. */
  getLastGenerationDiagnostics() {
    return this.lastGenerationDiagnostics
      ? __spreadValues({}, this.lastGenerationDiagnostics)
      : null;
  }
  //////////////////////////////////////////////
  // High level API
  /**
   * Calculate embedding vector for a given text.
   * By default, BOS and EOS tokens will be added automatically. You can use the "skipBOS" and "skipEOS" option to disable it.
   * @param options OAI-compatible embedding creation options
   * @returns OAI-compatible embedding response
   */
  createEmbedding(options) {
    return __async(this, null, function* () {
      this.checkModelLoaded();
      if (!this.useEmbeddings) {
        throw new WllamaError(
          "Embeddings is not enabled. Please set it via LoadModelParams.embeddings"
        );
      }
      const result = yield this.proxy.wllamaAction(
        "embedding",
        {
          _name: "embd_req",
          data_json: JSON.stringify(options),
          files: []
          // TODO: support file input
        }
      );
      if (!result.success) {
        throw new WllamaError(
          "Model failed to start inference",
          "inference_error"
        );
      }
      return yield this.getResponse(options, false);
    });
  }
  /**
   * Count text with the vocabulary currently loaded in the runtime.  This is
   * intentionally available as a narrow product-facing operation so callers
   * do not estimate token budgets from characters or a second tokenizer.
   */
  countTokens(_0) {
    return __async(this, arguments, function* (text, { addSpecial = false, parseSpecial = true } = {}) {
      this.checkModelLoaded();
      const result = yield this.proxy.wllamaAction(
        "token_count",
        {
          _name: "tokn_req",
          text,
          add_special: addSpecial,
          parse_special: parseSpecial
        }
      );
      if (!result.success || !Number.isInteger(result.token_count) || result.token_count < 0) {
        throw new WllamaError("Model tokenizer failed to count tokens", "tokenizer_error");
      }
      return result.token_count;
    });
  }
  /**
   * Rerank a list of documents against a query.
   * Requires the model to be loaded with embeddings: true and pooling_type: 'rank'.
   * @param options Reranking options (query, documents, top_n)
   * @returns Reranking response with relevance scores sorted highest first
   */
  createRerank(options) {
    return __async(this, null, function* () {
      var _a, _b;
      this.checkModelLoaded();
      if (!this.useEmbeddings || !this.useRerank) {
        throw new WllamaError(
          "Rerank is not enabled. Please set it via LoadModelParams: embeddings = true and pooling_type = rank"
        );
      }
      const top_n = (_a = options.top_n) != null ? _a : options.documents.length;
      let totalTokens = 0;
      const rawResults = [];
      for (let i = 0; i < options.documents.length; i++) {
        const result = yield this.proxy.wllamaAction("rerank", {
          _name: "rrnk_req",
          data_json: JSON.stringify({
            query: options.query,
            document: options.documents[i]
          })
        });
        if (!result.success) {
          throw new WllamaError(
            "Model failed to start reranking",
            "inference_error"
          );
        }
        const { score, tokens_evaluated } = yield this.getRerankResult();
        totalTokens += tokens_evaluated;
        rawResults.push({ index: i, score });
      }
      rawResults.sort((a, b) => b.score - a.score);
      return {
        model: (_b = this.getModelMetadata().meta["general.name"]) != null ? _b : "",
        object: "list",
        usage: { prompt_tokens: totalTokens, total_tokens: totalTokens },
        results: rawResults.slice(0, top_n).map(({ index, score }) => ({
          index,
          relevance_score: score
        }))
      };
    });
  }
  createChatCompletion(options) {
    return __async(this, null, function* () {
      var _a;
      if (Object.keys(this.chatTemplateKwargs).length > 0) {
        options = __spreadProps(__spreadValues({}, options), {
          chat_template_kwargs: __spreadValues(__spreadValues({}, this.chatTemplateKwargs), (_a = options.chat_template_kwargs) != null ? _a : {})
        });
      }
      if (options.stream && options.onData) {
        yield this.createCompletionImpl(options);
      } else if (options.stream) {
        return yield this.createCompletionGenerator(options);
      } else {
        return yield this.createCompletionImpl(__spreadProps(__spreadValues({}, options), { stream: false }));
      }
    });
  }
  createCompletion(options) {
    return __async(this, null, function* () {
      if (options.stream && options.onData) {
        yield this.createCompletionImpl(options);
      } else if (options.stream) {
        return yield this.createCompletionGenerator(options);
      } else {
        return yield this.createCompletionImpl(__spreadProps(__spreadValues({}, options), { stream: false }));
      }
    });
  }
  /**
   * Private implementation of createCompletion
   */
  createCompletionImpl(options) {
    return __async(this, null, function* () {
      this.checkModelLoaded();
      const isStream = !!options.stream;
      const isChat = !!options.messages;
      const customOpt = {};
      if (this.seed !== void 0) {
        customOpt.seed = this.seed;
      }
      let files = [];
      if (isChat) {
        const tmp = this.prepareMultimodalInput(
          options
        );
        options = tmp.params;
        files = tmp.files;
      }
      const result = yield this.proxy.wllamaAction(
        "completion",
        {
          _name: "cmpl_req",
          is_chat: isChat,
          data_json: JSON.stringify(__spreadValues(__spreadValues({}, options), customOpt)),
          files: files.map((f) => new Uint8Array(f))
        }
      );
      if (!result.success) {
        throw new WllamaError(
          "Model failed to start inference",
          "inference_error"
        );
      }
      return yield this.getResponse(
        options,
        isStream
      );
    });
  }
  /**
   * Same with `createCompletion`, but returns an async iterator instead.
   * Only called when stream=true and no onData is provided.
   */
  createCompletionGenerator(options) {
    return new Promise((resolve) => {
      const createGenerator = cbToAsyncIter(
        (callback) => {
          this.createCompletionImpl(__spreadProps(__spreadValues({}, options), {
            onData: (chunk) => callback(chunk)
          })).then(() => callback(void 0, true)).catch((err) => callback(void 0, false, err));
        }
      );
      resolve(createGenerator());
    });
  }
  /**
   * Whether the currently loaded model supports a specific input modality (e.g. image or audio).
   * @param modality
   * @returns
   */
  supportInputModality(modality) {
    this.checkModelLoaded();
    if (modality === "image") {
      return !!this.loadedContextInfo.has_image_input;
    } else if (modality === "audio") {
      return !!this.loadedContextInfo.has_audio_input;
    } else {
      throw new WllamaError(
        "Unsupported modality: " + modality,
        "unknown_error"
      );
    }
  }
  /**
   * Unload the model and free all memory.
   *
   * Note: This function will NOT crash if model is not yet loaded
   */
  exit() {
    return __async(this, null, function* () {
      var _a;
      yield (_a = this.proxy) == null ? void 0 : _a.wllamaExit();
      this.proxy = null;
    });
  }
  /**
   * [FOR DEBUGGING ONLY] Run ggml backend ops tests without loading any model.
   *
   * Initializes the wasm runtime, executes `test-backend-ops` with the given args, then shuts down.
   *
   * For more info, please refer to guides/debug.md
   *
   * @param args Arguments forwarded to test-backend-ops (e.g. ["-o", "ADD"])
   * @returns retcode (0 = all tests passed) and success flag
   */
  testBackendOps() {
    return __async(this, arguments, function* (args = []) {
      var _a;
      if (!this.pathConfig["default"]) {
        throw new WllamaError(
          '"default" is missing from pathConfig',
          "load_error"
        );
      }
      if (!(yield isSupportMultiThread())) {
        throw new WllamaError(
          "Multi-threading is required to run backend ops tests, but it is not supported in the current environment."
        );
      }
      const tmpProxy = new ProxyToWorker(
        this.getWorkerResources(),
        0,
        // single-thread; no model needed
        (_a = this.config.suppressNativeLog) != null ? _a : false,
        this.logger()
      );
      try {
        yield tmpProxy.moduleInit([]);
        const startResult = yield tmpProxy.wllamaStart();
        if (!startResult.success) {
          throw new WllamaError(
            `Error while calling start function, result = ${startResult}`
          );
        }
        const result = yield tmpProxy.wllamaAction(
          "test_backend_ops",
          { _name: "tbop_req", args: ["test-backend-ops", ...args] }
        );
        return { retcode: result.retcode, success: result.success };
      } finally {
        yield tmpProxy.wllamaExit();
      }
    });
  }
  /** Qualification-only attested single-thread backend-ops entry point. */
  testBackendOpsSingleThreadQualification() {
    return __async(this, arguments, function* (args = []) {
      var _a;
      const attestation = this.config.backendOpsQualificationAttestation;
      const resources = this.getWorkerResources();
      const commandIsExact = args.length === 2 && args[0] === "--quant-discriminator" &&
        args[1] === "--parity-decisive";
      const expectedBuildId = "retained-v1l-quant-discriminator-s10-20260831";
      const hex = (buffer) => Array.from(new Uint8Array(buffer),
        (value) => value.toString(16).padStart(2, "0")).join("");
      if (this.config.allowSingleThreadBackendOpsQualification !== true ||
          globalThis.crossOriginIsolated !== false || this.config.forceCompat !== true ||
          !commandIsExact || !resources.compat || !attestation ||
          this.config.expectedBuildId !== expectedBuildId || attestation.expectedBuildId !== expectedBuildId ||
          absoluteUrl(this.compat.wasm) !== absoluteUrl(attestation.compatWasm.url) ||
          !this.compat.worker || typeof this.compat.worker.code !== "string") {
        throw new WllamaError("Single-thread backend-ops qualification scope or attestation mismatch", "load_error");
      }
      const workerHash = hex(yield crypto.subtle.digest(
        "SHA-256", new TextEncoder().encode(this.compat.worker.code)));
      const wasmResponse = yield fetch(attestation.compatWasm.url, { cache: "no-store" });
      if (!wasmResponse.ok) {
        throw new WllamaError(`Qualification compat Wasm fetch failed: ${wasmResponse.status}`, "load_error");
      }
      const wasmHash = hex(yield crypto.subtle.digest("SHA-256", yield wasmResponse.arrayBuffer()));
      if (workerHash !== attestation.compatWorker.sha256 || wasmHash !== attestation.compatWasm.sha256) {
        throw new WllamaError("Single-thread backend-ops qualification artifact hash mismatch", "load_error");
      }
      const tmpProxy = new ProxyToWorker(
        resources,
        0,
        (_a = this.config.suppressNativeLog) != null ? _a : false,
        this.logger()
      );
      try {
        yield tmpProxy.moduleInit([]);
        const startResult = yield tmpProxy.wllamaStart();
        if (!startResult.success) {
          throw new WllamaError(`Error while calling qualification start function, result = ${startResult}`);
        }
        const result = yield tmpProxy.wllamaAction(
          "test_backend_ops",
          { _name: "tbop_req", args: ["test-backend-ops", ...args] }
        );
        return {
          retcode: result.retcode,
          success: result.success,
          qualificationEnvironment: {
            crossOriginIsolated: globalThis.crossOriginIsolated === true,
            sharedArrayBuffer: typeof SharedArrayBuffer === "function",
            singleThreadProxy: true,
            forceCompat: true
          }
        };
      } finally {
        yield tmpProxy.wllamaExit();
      }
    });
  }
  /** Qualification-only replay of a banked exact activation through a seated real tied head. */
  replayTiedHeadQualification(fixture, expectedBuildId) {
    return __async(this, null, function* () {
      this.checkModelLoaded();
      if (typeof expectedBuildId !== "string" || expectedBuildId.length === 0 ||
          this.config.expectedBuildId !== expectedBuildId ||
          this.config.allowTiedHeadReplayQualification !== true || this.config.forceCompat !== true ||
          !fixture || fixture.replayContract?.exactSpanBytesRequired !== true ||
          fixture.replayContract?.preserveNeNb !== true) {
        throw new WllamaError("Tied-head replay qualification scope mismatch", "load_error");
      }
      const result = yield this.proxy.wllamaAction(
        "test_backend_ops",
        { _name: "tbop_req", args: ["test-backend-ops", "--tied-head-replay", JSON.stringify(fixture)] }
      );
      if (!result.success || result.retcode !== 0) {
        throw new WllamaError(`Tied-head replay failed closed (retcode ${result.retcode})`, "inference_error");
      }
      return result;
    });
  }
  //////////////////////////////////////////////
  // Low level API
  // TODO: add back
  /**
   * get debug info
   */
  _getDebugInfo() {
    return __async(this, null, function* () {
      this.checkModelLoaded();
      return yield this.proxy.wllamaDebug();
    });
  }
  /**
   * Return the current worker Wasm linear-memory capacity. This is a
   * nonshrinking high-water proxy, not a live allocator or resident-memory
   * measurement.
   */
  getRuntimeMemory() {
    return __async(this, null, function* () {
      this.checkModelLoaded();
      return yield this.proxy.wllamaMemory();
    });
  }
  //////////////////////////////////////////////
  // Utils
  jsonDecode(data_json) {
    try {
      return JSON.parse(data_json);
    } catch (e) {
      this.logger().error("Failed to parse JSON:", data_json);
      throw new WllamaError("Failed to parse model output", "inference_error");
    }
  }
  prepareMultimodalInput(params) {
    const msg = params.messages;
    const msgNew = [];
    const files = [];
    for (const m of msg) {
      if (Array.isArray(m.content)) {
        const newContent = [];
        for (const c of m.content) {
          if (c.type === "text") {
            newContent.push(c);
          } else {
            if (!this.mediaMarker) {
              throw new WllamaError(
                "Media marker is undefined",
                "inference_error"
              );
            }
            files.push(c.data);
            newContent.push({
              type: "text",
              text: this.mediaMarker
            });
          }
        }
        msgNew.push(__spreadProps(__spreadValues({}, m), {
          content: newContent
        }));
      } else {
        msgNew.push(m);
      }
    }
    return {
      params: __spreadProps(__spreadValues({}, params), {
        messages: msgNew
      }),
      files
    };
  }
  getRerankResult() {
    return __async(this, null, function* () {
      while (true) {
        const chunk = yield this.proxy.wllamaAction(
          "get_result",
          { _name: "gres_req" }
        );
        const jsonString = chunk.data_json;
        if (jsonString && jsonString.length > 0) {
          if (chunk.is_error) {
            const jsonData = this.jsonDecode(jsonString);
            throw new WllamaError(
              jsonData.message || "Unknown reranking error",
              "inference_error"
            );
          }
          return this.jsonDecode(jsonString);
        }
        if (!chunk.has_more) break;
      }
      throw new WllamaError("No reranking result received", "inference_error");
    });
  }
  getResponse(options, isStream) {
    return __async(this, null, function* () {
      var _a, _b;
      let finalResult = null;
      while (true) {
        if ((_a = options.abortSignal) == null ? void 0 : _a.aborted) {
          throw new WllamaAbortError();
        }
        const result_chunk = yield this.proxy.wllamaAction(
          "get_result",
          {
            _name: "gres_req"
          }
        );
        const jsonString = result_chunk.data_json;
        if (!jsonString || jsonString.length === 0) {
          if (!result_chunk.has_more) {
            break;
          } else {
            continue;
          }
        }
        if (jsonString == "null") {
          continue;
        }
        let jsonData = this.jsonDecode(jsonString);
        finalResult = jsonData;
        if (result_chunk.is_error) {
          this.logger().error("Model returned an error:", jsonData);
          throw new WllamaError(
            jsonData.message || "Unknown inference error",
            "inference_error"
          );
        }
        if (isStream) {
          if (!Array.isArray(jsonData)) {
            jsonData = [jsonData];
          }
          for (const chunk of jsonData) {
            (_b = options.onData) == null ? void 0 : _b.call(options, chunk);
            finalResult = chunk;
          }
        }
        // A final OpenAI stream object is semantically terminal even if a
        // stale scheduler bit crossed the native wire as has_more=true. The
        // reader-owned v1q native action clears that bit after its terminal
        // pop; this second check makes the wrapper fail-safe for the exact
        // final object it has already received instead of issuing a blocking
        // post-EOS get_result call and waiting for the epoch abort timer.
        const semanticTerminal = (finalResult == null ? void 0 : finalResult.choices) && finalResult.choices.some(
          (choice) => (choice == null ? void 0 : choice.finish_reason) != null
        );
        if (semanticTerminal || !result_chunk.has_more) {
          break;
        }
      }
      const diagnostics = yield this.proxy.wllamaAction(
        "get_diagnostics",
        { _name: "diag_req" }
      );
      if (diagnostics.success && diagnostics.has_receipt) {
        const receipt = this.jsonDecode(diagnostics.data_json);
        this.lastGenerationDiagnostics = receipt;
        (_b = this.config.onGenerationDiagnostics) == null ? void 0 : _b.call(this.config, receipt);
      }
      return finalResult;
    });
  }
  getWorkerResources() {
    const workerResources = {
      wasmPath: absoluteUrl(this.pathConfig["default"]),
      compat: false
    };
    if (this.config.forceCompat === true || needCompat()) {
      if (!this.compat) {
        this.logger().warn(
          "Not using compat mode" + (isFirefox() ? " (expected on Firefox - WebGPU will be disabled)" : "")
        );
      } else {
        const isUsingDefault = this.compat.worker === WasmCompatFromCDN.worker && this.compat.wasm === WasmCompatFromCDN.wasm;
        if (isUsingDefault) {
          this.logger().warn(
            "Compatibility mode is activated, using resources from CDN. To use local resources, please refer to @wllama/wllama-compat package."
          );
          this.logger().warn(
            "IMPORTANT: Performance will be significantly degraded in compatibility mode."
          );
        }
        workerResources.wasmPath = absoluteUrl(this.compat.wasm);
        workerResources.jsPath = this.compat.worker;
        workerResources.compat = true;
      }
    }
    if (isFirefox()) {
      if (workerResources.compat) {
        this.logger().warn(
          'Using compat mode on Firefox, performance will be significantly degraded; Consider enabling "javascript.options.wasm_js_promise_integration" in "about:config".'
        );
      } else if (!isSupportJSPI()) {
        this.logger().warn(
          'WebGPU is disabled on Firefox due to missing JSPI support. Please consider enabling compat mode, or enabling "javascript.options.wasm_js_promise_integration" in "about:config".'
        );
      }
    }
    return workerResources;
  }
};
export { assertRuntimeWireSchema, KNOWN_RUNTIME_WIRE_PAIRINGS, runtimeWireSchemaIdentity };
