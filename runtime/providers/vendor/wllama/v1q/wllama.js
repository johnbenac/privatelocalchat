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
  "privatelocalchat-native-destroy-20261030-v1": "glue-v1:69/23"
});
var EXACT_WIRE_SCHEMA_BUILD_IDS = new Set(["retained-v1m-slim-20260831", "retained-v1n-stream-slim-20260901T073847Z", "retained-v1p-checkpoint-slim-20260901T183523Z", "retained-v1q-chat-stable-slim-20260901", "privatelocalchat-native-destroy-20261030-v1"]);
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
  "default": "H4sIAAAAAAAAA+S963McN7Yn2BHtl1qWrDcpUg/qRWVKsi0WKbWbLauv23b7+trudrtfcfvOLAKViapKM19MIIukY4KxE7Ebu7Ef9+P+sRMb5wDIBJDIzDLt2Z2I+SKxcH5A4o2Dg/P49Be/+MXy5i9+8cWFX/xijWU8qpJSsJxM6yQVSU5mFWP/lqfFIqN5vr//PS9yQqcJWe6SnQl5vr8/pTyJCKS/amEffPDBawVe0rRm+/sx46IqTt7hIkbyr+bzLCV0WlTiizMWTzlnlSBJvqRVQnPxblGyioqi2srZ0d00pRklWRGzlEwpZ/v7UcWoYESwnBfV9TTNyLyi5YJERS7Ysdjfj6afnbEqMRV0f/8U/gvCT85YSEuaLYsk3hoqJmaCJun+PjsWrMppCo3goqojUVSvgianLLihOZ+8djQv698nefxFVdTldyxllLPzhETHlIhFVRyty79pmhYRdB07jlgpkiK/JgkwOdrEC3JI45gkWZne9nQwTKqY5EWV3Y3SpFSjkxY0ZtX+PvyvRodf4KJK8jmZFVVGxa2oyLIiJyWbk5JWHNB6sJ9ekSOdFnOS5LI33spYFmXlqvMW52RGy2dbvfP2oqoBfIXG8WXsuXo2Y5Xqtre4qFKm+mDOBKmKI/7htCjSLXMm6rYC4oCdvKpznsxzFm8l8On7nXbiOpS9kwhWUSitp1vToqIky95gx+XsIlajKkqGY/GeHC6WxySiIlqsITnhWEQyr4uaY31vyaouSlrRjO/v54Rl05gsGI3JwRBxeRNLlBWZFdURrWLCjkuaxw+wD7CL9ZB9/PGraEGrZ5gK7X5PVpfxBS0Z2Y2vyvrOayimkh1spdHosE4q9ni0f2dpQcXri4TEJznNkohElIuLOPmwE2HR7xq9XuciSZs5dtpDCcKrcq5XjHCaMYIVvzMweoLO5dTI6hSH5Bz+gv5/F/8qWZXVgkkQZ4LkNGOXZZunbJ7kcuRW3aDcKW1tUNc7IwmDuO5NJQfLm98n+fd0f39W5xGh1ZzL7i0LPjRfeUkjFoRXO6XOZo89c/i0kxaEe7gNYlMIEbDXTGlK84gROhOsIkkOB8CrFgBtxbW/qC7jGJubgj3J9uLz+DufnggGE79nVc1m+bVOE6pCPDZnHZ1lBcM2OGlBuG6k7e8bP95tpkNGxaZ/bS3J/JD20A6Att1b7yQvSVELksQ8COW3lgk7IrvxvcE8UPZlhJt997+f6UjbwoNne/AgGzrfBW4TshRIeuipeSfpraqo83h22dougM3oP5CiJYu+/cmHtpyH+Bv38sFuLgsehPaMnMQ3PfxXhofvNTlX2ZE6H3ELuTNPa0bESckUg2P//gDOqP39P02/Z5H4PeXslUz4tMhKWffTlhaEkiHjEU3Z20lZJbmYvZEW81n/0jg8WAaY6YhN52VNMnqguSsyTfKYzIGtICwX1cl/wp16FY4mwZWdlWmnq43jwyatZ5TEFZmlNCJwXAAfEdFowS5h9SQPgRvqW/LvewP7VsVKRsX/dqbpcOaprpv2H//ZmPKv+2csFSJ/O5UzfY38LT+C7v6Upum3rOJFTtNEnNwwT7mW87qmdnPkb0hUZCWt2J3uFs9yXlcAqHNxxZ1+O/EbUcFnX/48A/okCPs3MmgqLpmDZRCe16dmRMUDNe3KpGRpksP+66QE4UXozdd6IwofjFwKYEqvyr27J2xLemem1s8mNEoUByxPfmAVKVOaFRPVrgvzeT0jMxi3A3ZibNCT+AIX04QAE7nzMmUfmYfggvIFEXSasldtivw+IXFBKgaIV6Kq2euhSU5FkSXRlS4beHdoZdQpeyz3kObS8Dks7v39UzshCP/dh3sim7FkeEtpEboBLCtTGsHuFR0QnhZHpKRi4QDf4Ek+E6tMPNwJWVXBhfBHwfWscCbsNwNtIqTOkzwRCU2TH1isr0xFRaKiPJHTH4FIwMuXWnLyooP/Wwf1XvzJyrfAWVVkvo3l9+3cUZ1un1FQb8rhBkKOErEgPPmBOZB3eC4n8z0fm22tHln5Ka2qhFV9pw9cmjynjznnp+ytORMsX0oeGS6Zj4xpSSuWU5s3x6QglLceUdGclwVn/VelrGDA2G1YWyEwoeqvIHygSo8WVJCMz9vv6ZQglLx6lXHcV9dV66MDuGZN8W6Idf9vRkVZyZMU/sal9WzLIHFBK+EjQHGeZHUf9BbFDmsGbLKHFi2KxE+Bg08kcJH3Uam/FnnhrTPNT3Tyg6E7gqrov6wyyVN2zKrOGcIjmgfh785ewJyJIFyukh9r/yM2FAPf7Ci4uPI6TZEFe2hNQFpV9ASmIdyuFP/Hg/B69xyfzfI3qCiSdwhcIESy+3+d6dD6kfy5e+L5mZZrHtnCzg13cUh27B1C+GLORPSmoPliBjKUKCsHZ8MAE1XWfIHf2BqYcniN7/Azk/hhK6ao2Jwdw60sWsg2Q+sI8vRlxcjRnKf7+99WrKyKiHEOo1s2v1YdiZ/1puQfiZvu9pbATgVs0a7JtvMF7OUkTab7+2a62ts1M7XhkdjBRK13J34RzxF2m3i2hQzKG6JKspvNmUcFy1guQIDJolqwoSFjJQ/Cf1nhKIMDuPcgu1nnSVTEjESlgKvCnMsFF4Rf/6TNQzJ4RB7jQfjbs0qQ66wMVfdUNOEsbgWr3ZTNdiJ+flxWX0Pl9vdzlJoMbbgZrQ5AfHUJuU+o/ZKmMITnpKDs9Xb4uN1uSFTMl2kGZ5+bFoTW9aL9+wYhpVhUIDkCedYxqfO0iA6uucmQeOXrr78hX/29nTVB2OVYVGs4zXo5Fhsi2RCRZIzUfFddcIh6I+Bw3a5TIc9zHyUIQ/Ok11KX025iEA5tGoQcVRQ5KLlJz3aHGHJ5LG90rjTNevrhTPPK5rjdOdfLcdvAzZaP0p2HQv68rIUUFc3K3QkRBZmVOy/f1Ve0JZnEUsIR0ZzIa/WadQ6ozZczccvHPMH0hPF9X/VKnPAS+pfEjEftbc9KDsJzS82xXlfLSUtz2XHJImGw2DuxKwlNOOFH9EY3tWJRddvaTwvkXnFbRTGkLJcn86xIYsm5Alt4z2pZxgSV7SrTRBDcB69biJgt8WjcHhVtA+D1dNUbOJWMXVUcn8injc5sOPXCgvCmVT/V6Thx1yQ3Iuh8zmJjWm9yVi1ZRQTlB/v7p8avIHxsy2poTGDXkr9nFcjSQerMqtuW3FQ+qJSMzCjMZP547IQnRc5IMRs8VvI4CH9zZtnkRiay2JBDFsVBXcrD4L5fYH5wRKs5KSoQ/nU4kL34OW59vYKYJVU3SL6gUtJ92ZnfCf+1bi5OXMJLFtUpFcmSGfelDi0ItzuC9oplxZI5ovU7HoYiybIaBRJBqF8DeLRgGcUtgFUCaoaPgiA+uIoHRZLROSOz3Qnej/4yKhocGAfof5rk3JEUr6vrZFUc6d2kzjmdsU9/msTqgJ0Eob4Jw1qO2RKuU86SVk9lzeTgJ3m0qAoQAwXhO/K9h3rFvRHKB4Zekmgcv0PIjDN2UDzVSw9vGs3J5kkNwpty4R3RpVx2ZZTJBcdvm0syZsgktevxITRkQfOcwUtFKZksLmgeg2RdUW763yh4EL6TcMIOa6oevHiS1urhhcRJxtUzGOVi03cEJJwsCi66XAGyK/iA2MsVIOTJs61Zik+MwH+So0UiGL5MtQKH3UnKnq4ifiQJP6Im73SwRGn7ujpReIKcAQNeAsva6t56IBsOMdZxiCOA6RmEm7+XE+O7OoU1bPwKwvc7G6++c9L85GjBKoa3dnYsKhqJK+pFvWLyyKdp+kZZHM1W4n5l8Z3l0PCjJGOc0zn7X1daXvmSpklM5Hmz4mXazdQjo3tkbVGqycL9fRGHEAV+cNbKSQgTu2FeBJnE1431OUOm9YgeDI5ZzuZUsAmtRaEHxPw7KtIUeIayYngmxvK4gAc6ovjkWZKyXxGi/7wgX7EqhuoY73JRieKY7Dz/9d7uL4tanGuUINS7cT3FfUs9/yPLRfYUNzJnab2hKm/ehURBajH76GrLRZepEl0B68qyqDy5YWTgBMWNkOeXJY23eg7qih3K16S7AwCQwV9NcrHVqly8SnLxunM87sZy24zKE2OM9mLjx268hkveLEveaoaGTB5WpoKJki/CkSXBHgHMMhE3u6mwTVT0yPPwArvILXsq2JePc7CBLUCUc1exS2ofwvEESRmsZBAl3XG2WtAV4EcUGHd4q73t47Bx14FDyOa/IVkeYDd9my/MUnGdZSC4/RQXWyP61vJYvGVljBoXpCYpCIeOsYrN8Pr31z+SL7/59msl/34g8EYiWHvvclKC8P4AUwzcFa0qpYWT1th78mUzSmlWvjU7qhLBhq7I8iYWhLcHdI7+y8f7o0yLo+zS8iYX8GZYklmUFpx1j7b2XaD3aLMhH1jcG2wURN5Gcb68Cpr7KYCDcLP3rKt4zzleBeE5+V5VMbVbgsDuWqPshDy8nGwbMhEPuapVHcuLmNlSQHymnTLuXP7gAqT/rtj8XdwwchBqs/jSrKgYjRYE2GOUg3TXLQhScNiv6xu7WkicHZIq2zLv8SjYdxLWvOs6CNdbCQZnIgI1lBSZvXcIsLditvsYbjiK35J8IPJiTloQvsVBaD27oRY6TwsB44NaTkF4XSVXjJdFDk+UsPbVdaiewk230TSRP4Nwy2XM5SxoX7TuuwCoCoc/QCJEas7i63N1Qu7vn+o/8UlFMTu0qkgu92VezATJ6LHs5mYSzJKK61lw1ZQCkDipWCQeWOMMG2+z1fC6LItKsHjDwxNXDGfRjnOBgXMKX87cm40iBOElRcBegkHaauU1hPCiErvqhvNpKp9R5yurKSCF02MSFxnpYY+MBwCHVp7tO3A7QFHNj/7geULwLOSJmHW3nHZgerccG3JWFddWUP1UzmApPAW1NPX8UdIKHlFxdGDhAa/6TGI1Z6JmkNamcpLflanyHvPQuSLLDkpmoJtYMc4T4LHPKW4prR95ZiiKeJVSiyTYIp2KzRED8n+YY1BsrzgL+J232HGZ7cze0+el0g8YElXQ/CQInwwcSK9eBZqKeijmntYcoHIVElqW6YnaIe3bOHDAQXgd56bBRKGg6V0CGwJOLZJudGXpyBNGpVhVTmk/Jv0scsr/eranl7O+NsEQOG8MfzpbDYy+dhWbQMbUaJBIphQOs1+mxdzULJTCCJDlc1G5ck/5LLCmUiNacoICUjyPuL45ZKgBrH7xDPfuD9yZnnBU9/AmB6HnIJdTHw6i953Jpk8yXzJMQqmZh9L2ZsK/HBOKKv5PqVrAhoIvAprjgtO794VhLsX1Qy8MCvKZyXBJsY9sqJaXcaGKMuetQ1zTYlG8Au7vlwVHNkrz/2VVZKVoxafydxAOKiqurnP1/usglDzpHSn+ycpdLfyRElkUxrLjZ+OikbyQ6nZBeKdvbI5YMl+Iu45crKhFWQtSsaKK4VlqsyPRJM1ToUdF7bT5W2uGySvvencenuAcvNMVyEhhjBy+t2aztOaLN9lxOZldN/dnuCSXCYvYepfh5BREqE+9W+6c5YZMPSvldc58YptXNE8E20P5ETz1yb6dggTggvx7XtEso5XBqvAk+iSdf1ukSXTybGsVJYJ3tIDhbUJ4kscz+H+RJtnbhEQFj2dX4Jb3SUxL0Zg0fP6jp/msKnLhUM8rocv3RZL/qhG6fXTDeiNoLks7DveLskpUxfcTgnAliS5nldTM6h4ucF+4bkpAQbJKpong4aAGb8YysjiZVkncKLkvi4hOcdayYh7KtIOlXBuGMJgJ+XZGDg5JBo8iKyBJEh/zNRso1Q5oxW51l00Ss1wks4RVz0C8ooYE3+vhkQKlr/NEcOeVfgRsW2282wpC2cll66IADJ1Uvl2yiMSFgL1dSnD4oboiHtY0F8kPDB5NyeFH5DnZO/5IYthxud19N9N3BVhCWuesl9OC5f54+EGirJIsgQeQu91Fba28u507Y8XyWMtocrFmn2FKH6/+6AIB4SvL43gmZpO3j5RlAqy0z1Dsohbav/teMh1lyQYxpixpAR8OiIgbyfBVLkBuqASsC5rHKZoziWJ21zmkTq3fQbhurWLjx9sg+pvmsy1bUeFbsw6fxHEQ/rIsjm4jmyNnerSo8wMpU1BfWUPqgqUlaKkU87m0FZtvGYu2mM+nnJB5AbMVTq+SztmtdsyN1w6lDq4kHSBkba7T8KN53ukeUrxIlwy4JLW01bUSBR1NGWZiEF7vKnkm+Tz03kpgOtLqxLqabHiReB1YV6R5Wkxpamz1m92DstGMkuLSdIJP09pWLa0Jq2byV5wspcWYfX8/Mn7vxKRceB/y50z8o7tsrfVK1IMdbukrY4PwWudInzOBfOj+fgR6pbATRgf7+yqrqChsWHiMksM98lwum6OiOkCO7n5XgOmm7A08pvaSnllsQFGkeGe3hUxN8hVj36g/QuHaxysd8q3ugX3KX5Lq7q3C+496W3X1+3reVjdNObbSANAteouQI5oIeKAULE2Lh1988bc/fMPA9uyLr/7+qv3Vqk8dLN8+iipRZNMebeXmvbtfW7mBdLXEutJUR0vMBvyuLQB1eZTojjs6PW1VnM7ZQHmfFp8aP4LwmmR+Sh5rPrtK2aWGIyJSN2vdvRbopfuW3FGPV2F3wPCrmJGK5nO2kpTJzNDzsvZ//JR7x1kv2WAf4fTwrd53bJKym+1dhsDBD6xcxrKiOtm0WDSbqX/Sx4A13F7Dgt0fMoIlWUqb9wm/Ea2E/EqdNxXrqAo0elYwDS4l2RwXF+xvMFsfzhWP39F+PNUUrZfOlQ2ybWS2E/uZr6+A+erny/aUkSqs80l8yTRdJLQ+vqh1fmGO0krexZJsEhXpjc7GjRZFgZUsL2GRONbm31KcBBe0X7LjUu+exj6Lk4zkwKBpZhjk+0k+K5BLkX8G4bOVsird3XBABKduMYrjCwaQOMHzOpvCuTUk1YN5zTfbo4QzfFQlsDeURZKLO/Yxo15Qm7vSXYvsysGDUB4vOcmysiq+x1n4cSsAl6sOH4ocvh4vb4xWWpOxMVkZN2e3Z+WueVKYV2Fd4U5aEN6iZWlqvlo/tSAH7TnfInhWXySEg5GklGnN5JM1Z+I8IIFljLLSMNf/TNrz95mnAF/uMU+5b16FK7ZkjeyveTr4emVrHXlJSsQiYyKJvII/1IRfVDetJyIlQYhSRqub6klJJFmSA4snCiI1Rt6raA5vBVoh+YZ+tYoKuCFVBY1B3eb+AGP+t5yCOO+Ry5bv75+6SUH4NzfJvri01JGLiw280VETTHKxO/mz+e5lf6iljHzIBq7ZjwhxwqVpwlU7HYXmz8bMB0H7A+7M7LjUT6lq0UqBq9yTHq9y368Kcc93zZByGHyab2W6ojppHbbUefRnnQ7H3BMfPySKg5FusoHuRQaWVh6v4aEjb4yVIWW5aafHrKFIMcHBUq4CsEW43ogJmmfF2e7knJYViPdau2QyTag6z2KQTGCn2wcM6vUCh7fuu6CALV5X3RZEBRu++wXI7EoeWqSorJGEd2dTvs1dTVlFw+X6I24qXzk3la2ucKK5irIZD8I1rVaET+OgiomqllL1PWW4u0p+R95kleq7h9JqbHQlJqjepmWizaqIYGMe8s7yXzY6spPm/Lqmzid1wZYc750eMxOQKiW5eNR9nZcik4xVc6a9aFxWZn5oP38M+ZongKJk+TlCUr6oRLL7NiEpE7PJtn1PwRcvvGwlMSzpYsmqKomZFOFk5RocFn9Bu5lvirhOtSDnRivaUQozOAf6Dps/16z2HDbde1DjJabfatOGdO9B7ZD33INswKu2AMkoyIXv4RSgGIdF/7LvEiv3eLzvlob9FEln2UQZ09AKFT6AKeBB+Mw8d+OihsldVGB1uIDa2N5z3qpzsCVbQ03PlNEYGLZW43PTupqdWnezt/kJj4p8pgTU/CAp1XVNC5Ck1GjLuZ1BXfXsr9gsOX7qaG9lOKdOPalB+AafVgdXDaUSYFKTWRK9g6fFX0T1eOCQ/rqYJxFNPwEt9ouSe4QHMCjj5/JlgVMHd/+OgA4VtzGV1nFSkIylnnMfaauc+w0QXE5MHth289OSES4lYupIgyOma5SiDsV+/yb4YJUt6BNAqC2CZlOqznJf6rrNBrCsFCfY+LsevkHv/LAknpi8gnrkIeglBvWegLvWl50bFqcAZ09KT1h1r2UTWJryRsKoE1ZiJJbASKzwwLDE2+0d94HB/n3DlJm2f9/u51M4O7zbT0W9cI8dfFJueU13jFeNJwqAZnnmfeHUSQnCx31QJ0HLWluXRI0jIuvtXKCMFq0WHxrPJaDnBv1CiLY/epUW+Xz79S4yQxmfE+PYrRjXd/YuxbXP46Kyn1eA31BaK0Wa9t/o9ySzJBcDaOBdN363ii3y+j5LUuma6m6vwY+0NrZlv1JLBpaEx9TJMI+AOnd5L1gq9zqpoPNv8lZdxQJ4IQE1saTIO09AwlBs9VrlA39/cc6yjO4RdW+6qJzEKKv6N2eZIPX/5Jb77/cykGVVTDmRO73uQZc3lP9vdLlXPN/rlH3sezHncj9yDS5dchD+zeErtWQGFcjO7JTjdg/3KTenbZP5lAI5sOWSPc+yKYtjvIyvrBt8z9UNNpRM8boOAo4YJOpvSZuAC0qNDxgfMVsD64BjOk2WO1AfGv/t689/vzP56OY/vvj2b1/mYKQTsS9Rf/wfNBGf5Cfr+vhU2z6vp1KqoLidH+QyX9SzWUbzX/Ikv8LZHNQv5M4CEmr+JvodGnS5gPocDA7SsiOpVHzA9mrK01/9DM/7hPGIliweVM/6ccaSaAi2mvujjuHKqZsUhG9n00oUR9FmK7/+elfKPXgSMxQcbHaUFFojrceGkVZzaSOKwTZE5FfBqVvGUmQTRVWAELSfX6q4VH2+AAjkWGDnvN6VpIMpk60CgZPOlrJfsTkmODF8whdI3/PJGKUKEVZBu62qTNNxyy5gyqqW7YOaYwM3WlehjSptzGa0TsWGy22BDBl0sqrsgz72yZ9+uw+OQtJealSekIOVXiIkr3bNZMZwplT0aN1MVIPA0jQIb3QJMIU2XENF2OvkaGzbKuM1vsu2LnLk7yC877BvqE8u6wn8c0yK3K+ECwNgvHVr0JyKBZweUtwOmzkaX9cVT5bsveRwcsyl21loBKirNHu9rTnc7O2NgPZFw23JeYnvEC4j5pDQ0Wc9k3dlfJOAHrxscWew21+y2DMuKsMJQcbf1RafIDW63pg2qTVXc1Fk160nFY6yJxZd0O8qeO+4pMzUBKvKAk7Dy43qfQ0SW1KU7zUpkrO7oIymamyBz0krZyA78loNcW01dNNHxTPzrz/iuX9l6Ksusl0HWgxX5LMEdP/thCB81JHWSXmbyU56JHVCm5q+ASKEd3CGReL4DVbNZj47wER828MdnZn3cA3wIPeQO7aSsYPnfTYRfSYRG36uCtr7V4ejeuJTko0WdOQ+bwPvIS+Eq0Nr8sH/eDXagn/APYYAq574HCGHuHarDZOvwX1CsCpLcirYfWkQGbOoQq3Q9voG0lBct1dBuKa5HyWYeyEFbt8Be82FUnP8E+aD5e9ND8K3jiK/XkJ70vTK42xIr9IxjUeVjhXktWuj3+/LDW9pju3+bp9MbsBH4SNL+iYfzghVCp4lTapXSuyGiqWwYx+k7IKoEjR8qhIWhKH8JYVjeBXJ5d3aSQnChx7rqU7S21xUeZSVF1pjZkaFsuWGSbSk6UX5a5HMF6DGeUX9jFE/CVuqENNE4IT5JV9Uv+SL9Loj3JN+PV4aWm26LhG8IM+SnKbNwxt4ViIFTZAzEUG4aT3dnRq/gvBJv4mnPsS0mut6c60Hg67kcI/k8pJ+3Xano0bn8Cfa5YxKfJ1JF4RXcgpv6nKYZY/9u2u1YFzJTOkgIlaRDjbAjR5FwbLgXREl7LOXYA2WuwAQ8lmo1R7BM73xcHy94bxjwk9ysSAwwW+3/LirbFLRI0fbRA4Hapu8Z+omlixHHXswcuJFXUXMLexqRok2c9MM6RVIy6wkaI1kflTCmyAtBTe90cGH/Vz8EfgpkE6qFskMVlJRsQ9WxwMD/mDM7TxJ4mF9aRS+4jNeEAZ+AayRMpEy0EkLjFkqKMmVEZUprbUptqLPqfELTV/9l5TkB62Ig9sM2ooC+4Njxo5Fhzg3iJfNWwxeYizn4DFjJfDak+59xHwjto/kB93LTEdubLsWb+5nQaiLzWjZOiXPaIludqXrEpikkq8GfxXGBQCXzQPnGgKOL1qM3K9d/XYbg0ypsuUZR0K/1uBPaxCJb/Dd4nq0tVof7a04G7bfRkdI/91YrSQFQetw5ANBbwtdwzcKwV7n7PC+GIRKxq3UxQlLkTd5/Xr7GVqc6nmn6XBMgZCPCxodXDFvZvKydslMgqlzr3t70zc+5dfGVVq2ZyqwE5dMOTzsfVYC7CpbA3J85NS3fYBumu0nS5+PeqNdcy6MKcvnAmaJdUs05fRuylX3PsnYQeC9Y7bXy0ay6poYKY1qtCFaSw4n0iUzmKWTHAQO06K2TChaMT/lhph/Cx8n0c+gq7NHpgn4cqNKhm+ywTeaa6O6AxWzGWdCGkGIKrnQmFuXac3fUTfH+XvWZVF7G8sYzSUkLeYbhqAfXq9R+1BeNds7IjhIKMpNy2BfaR6SHLkMWzTfPAXgTUqqWdkmVfIxQM4Z/Pi6h4zvdL588rDz5AMbW6WTcaNDQB7OvtDh0a5svmwnPPp4yspaMHm7fejxiYGn6/ALhDJZ56Qo1zpEucHe9txFpbEw7NO33TsoGrfAvgmedKQOJfrZi6+gejCLE0q0A8d34kLKJy/FKYigj+GTNE3m+QWwIilAwAJc0Dsxi1JowJpHERIWvdZ5VBofanPsJgbhNed+isN420nEB3Gax6g3wbsmy8b19UQsitZv5ph1sxKToyDHhRLzyc5PCkLLVQQX+jUC9VrWuq8UmPvTXj1/Eld0Joa8qklEEP7LaBkjgIcDdgiNnDywQYon8CRqDR9991A0URDcyP/pNVT4WUQBN82ilTnhCTxgsj+6bzlxMpud8ZuvWz90rcqRPoOa+9mkvVvDjV8ysXLu91Gu2cYa0lZ+zUpU8tPkB3bbb+wcpeh+96/to8+TVZRx9WEGpmRMbnrsuHSejr47U6HffQ6qdCnhJ9m0SH+WIj//7nPj4HWKvGy+LOARc0mlNG+Y/+bXUbYNFeFz0kCDCvUAy6KMOiK1nqK6NR8v6gPTdUjCCSpoo5ROWk2oQuFfVJXuE7e0HoPhEZUCbyASxj82VaVx3WkXN4TmND3hCeoseQlB+NTyOAbJPzBcvZDJ+h2EbxNSz9Li6CJpXxdJVK65DnpFdQL3ykvGiySqtP2KIEMBRcCfs5Qos+IUONVzhEgXS8d7phCP4NUMfDBxLt3SyMUm1czJlMH6jTmo6bWZ3jmCR668zh6rsbemIpqGtAS/lK0bY6IjZbMhXcW5Vu7TozhnA3r8VKOfr54CbIBXdc8RFXZV9wzArmnCVII7tWeSs5e57aBZGS0ddb9GUP2qZeMbezAVRtCm/NYUE/ZJvSEsT9R4wG+WVY9Uk5Dmq4NSzS3LRL2oxJ7z6NO7Dj2SALhgPzQLTHJRFVCqU6jl/2EwJIuv6op8CwuZzdRb1YymnD3bEhVqhF5oVE/BIuQzKV0DBR77VGzTx0/Fv3eEqU9G5nlPWTZQGgofy/9ibewPB/hNZe+WZ6hPaWhiXmspcyZgH52zynTIOWU3fNqXOy/f4MlM3HTktAeMldL51IsRWS1y1g4rAIZ5tiMu1CK85ZhegPq+MrYIwvuKeFgziBEJKt55XRJQiUf/kpQf3LbcdmgBRF3G6AIs6JcAY1Ub+a9fVJzSOo8WWDe5DcAX73uh0YJFB+ChA+Sjj2yI0sVxPSr8Qal82PNDJRrnb8/8UMDX99QAqB4oQduAcdNU5YYl3BaHE/IcXnHc5B2ZfN1KRsO0bupL8pUn9UVP6o431VfunreEPW8Je94Sdr0lTGSq3eR8OSv3usnZsUq+Yp/UsOFes9SG1GvAtVZ9GHWiUSAzZPjzF5D3BuGQ2vF3LEXtGJoG4b0B3DfodPhhI7sBfckCbUGm9VxrH+VJWTJxtxcE6p5BeE557cqF+mvBjn+lbncLWr3XPF7ELGWClT+7W7XTIXQQ/p//f1jGsgrsCOzUVfW+XUPv3s/8DIrkNumDXguAlC4pqRdgzJ2CmiNibts+1k/Nn0F4CX9OE5FJ307sPZnQCDTfNxTUra8dLRJeoqeUhlcJwmcGWm3XqBIL6lKzJBWsmtL8AK4KVXJ8LqPkCI1J4EUJnpPiqp0ZuJXe7jdU5jsvjYeoxlKZizgpHILUAQNC+9oUg08V5acbCjS0xrAc0LjSH3tpe8lQxnTgHkM52lexVCNaCnAzr9zITjrKZqIAI7iqOE4y4EsMh/2iQEl512SvTnLx0dPhpy88v/QlKrQfo3mZGYr/1QmKw6YJiNEfDiDhBMcj6FMbJL31xDltoacjCHxt6LVFgOqAIo+s0qP2+asxMnGTgvCD/hctfRHWjzLwYvZkDI4uOZCdu9Zo6aGikuTEbnv43Jjp9jxYwQmjUhEDyUar4opv9vn1lhTRmtMUq+xYTqLMw3oQOzxi+a7fFMJ69jIVcJV8HJSBwl7LCvd5zTSsILPG3fdD63WuYjTz1MSq8ZQm0aKmuQennnYyuAS3j23wq3kWcl/bGr9NH/TR/en3+uD4ZAHM4GafEiONY9cIBN7WOiqMkLjS+xralTjPddb7WvPnLRck/U/Kx0H35U2+cDUvb2qCtdp3OBxuQGQZtEV6xdlwXtrQQFFOcPWtuWcik0QsrptvbLI29e7E0puUm9rupHkxbJ/bmoeNCpzB3e51IQT0+75nNNkfGnJnAELjWA2RKaNs5p6Z2FTURrYO+Tbdp7pWr6a6a9Fk8BJ4heVIDUI7Ggjej/b32WGdLGnKcnHLR6Yg9wMbLR3pSjq2z83nvqMFXMom3ne6VBq9EXS0j1r3hrOk36osYNmA75VwBthxtHpJl7TTJB1J84ZKAKa0dULI11wjIaUF2klXf2w36Rmqq3Ujn2F9NGya5LYLKBt21/O2GNXTJCJlkqbF0eNGjxX3KUe3VadB/Dedpi6AcE9z0DZFe4JG1RCYJbaF0mx3cs19y4St9lIb5VamPsVnLV/kObSkzJeTuIl+9WsTO0tBzoJKJEWpfUf5aGg8ZTqe23kp9WSXRkxO+YrYCFngdgXH3zvaF6oyPxesbB2igtPudWV0VTJyQit4RQFnd0nGH2j3k8D+QVuKUiQZbZLg8Lnc+BnWjo27Wr+LREdbRrkSJEF9VdzjOuN1dku54pJPmFqPVxWy7iXGdXnH95KLsl8UYtj274YC8CT2kuZIuuF5xM3Z0V1PslTUwmcffr+H3jj4+4FteyD6l/YNM2PV4x4HtfKv1in0gx6c9EEvk6+7GJzBG53UxoeN3UwZ2st8XrYLlJxDmnp8kErvT8fY8Lt+Mj7twr7hNWiDA1LOGlBkAB1aUZTkQDphx6xoiwPnyJuzoyRm69IiRorC1J6f5DmrNn0h6NXL8nWWSckazhhtA/k2vETXIvpVLJUK+El2E8R/cqz390/bH0H4P7lFnXYSO+yNSDItu72uGE57KEHYPBUroSPI/vChSkseSTwT9/tBOEfjmRhyhKTe7VVwuO0BpHKEBBpNozB4XWtfbn0w/GM4LMfTj81IL8Yjv9TpOYFIdQ3C1ZhvntI/+HE69besZAel46TI8ZX6eG5SEOoi5GXDeZHXFUYmWJu6y4vcKfwXhP/ReqdGpldUCTjJ9D6gG06uhx/tFdAKl2H4M2x6a9MCNAYF0l+OSYMhMbxpqfhhOPj4MnmvF1yUAp8Nfm0h5PToC8/Z0tBBSktTdr6wtb+JAVgee0w+tRKUPkdhbzef+iUjznIQwRgeScgJ5XQC4vkTsDIuqkwb5XEVE4gptSjdOOmBPxLH2hF6JI5hGbvv7h4/eGdTIgBfMVTAdu998f/7mQqdVnAcif5X/z+frViN8Wg7/PFMJdKjA2UL6hT3lzNrOvRrT3x6ljLdWEFKrgJ7/E6f97auZoTXe9u3Z9SrkOplvJ5yp8DvflKBeeEpsqeOowobP7aOKxboreOjHpOmxhlNuhIKXdbc6kGhH9cLIOd7uadEvXsDOh7KkbO0qUxibagdhM99mZSlPApOaHpETziRvvLiIHwMGdq3fPSZ1Oq3PEEFF6j4RQhehrpR6MTjKiHLmVSHbRR934VXetBVmcWzyTmw8kKpynlCRKqc0Z/Dv+Gv84Y2CkSFr6dititjjszQijI9Bz/KPCpP3kQX9obCSnWEzrNkmRuddFGdVDH8dbElgTf684TE6CeTVVXHlP4v0pT+la3F0lFg0SbWcK9PIkmh0wJ097j49YqZZ2BPb2jI/BjVmeZjgZ1Jc/1oLoJvxDP1OvEe1KSQ11To2rvgLUA6qpK+Aj4B74rfyrfsb2h5CzRkwFUV+1P+l3qaJUKw+B9FdfBZkbMN29jONKO75TrDMh1mbRjhBr7MZ8UfKsa+AbFcxfu8ZUF2j7esPviXagt14P+hrr7KbXYTHAwVW0BhX+kDYX80P7+h5TdFzJ5ttYu8yOfOz/BjCf5Ucg3fKjHGZ8pVCZr+99KC8OOhmrXhrr3kIHziD5LtSz13FHF0uMzvqb1anU9g+uE4Ov67jbAsw7obPZq2oiHcklUpLUuUJeL2ocuRb45vL2UMtGvKf6KuJs6WPj/Q9ZT0x4C3IT1FNDaL/UU0kK4eVjcskaOHZQN6FbkMHtyvyKUAhiIXZ0IqcuEvnyKXNvO0lb9cE1Gv8tfHbR6Qc/MTLljWxhJs01RkMbvQPk9x3dmBnuJsjb2O/tYLR9VqwGzVfGQSJyXKhfHa8aIvz6CuuuXiFdSMSF06lfnzj/Vrp02/iqjy+7e75j7AvX69HT4YdnqHvMFTM1i42hIa2bUzEXcQ6xUMykisqWjZEmxouEIOGVr1ufHgBY7nn0iLp63gSRioGM1Q1pNQ///ZMqlETdMtAeYJW5rZkFOngBBjNOuwZ6cWORguJBkuJNGFnFvOEsmyXJUh4y1Hfq/bHlkUVWP+k9eZcrggqcjtzCuaOj34r9bJIHPLoJzK3yeOojQowsDxeL7DrdS5AbzvKQjZIlI1l0J5DuFS9qJXqDTyrFc9uf9pp53Z6Q+qq9hNm65e9JgiTMN0Op8w2O38x4whduauldm8yKXFEYimgG1z8rynI+OJAkFb+rccfGn2IO2wCJ1lBbtuhdLTgZWv6VR4CNURms+BCgSahLxrmlvflj+M4NKmYf3FxuNTlhyz+IbjAEoKAfl9j/G9khhqK4prdmQDqcN3w0pshELvKpEyNvcc2htDJ2u9T8X2yluK0vsscWnuKWt9iEcwT2boCv26TMpovAuHJJfPNndl6vclSuRlXyFXC3qGJI7WeugbSs00mbUSkaJC/V1FUixJCSJx3NIrenRVeQwwvWNtqrSsxIcSiOSkLcf4psdPqI6Z4/MhiqycBrj6rSi9RGsul9JqctxwKMrS5Dsr2VXo1KRRhU4T+Gmfjq1SGjGCBPUggvA3o2V0LHZwHgbhRyvndPwx/G5ENbi30kgPwm8Nur8f6bhirAm0tY5VrdcdrWOU0EOAubsuQa4g1IeDmWG7m0C2UrE5rbaypEllEVFI5lwuVH6nL+waAIPwXh8Z/SpAl1yxNaIh/Q048HWDdDTDZovQRTpCa0M72K/PrJuOM9ofKx1fMaSxm5eutGPbZrUKhnZCEG74FKal995tTTKN1khn3l6RDpaUvgU+6EFsrJwdlypGVnoOvCGiRHpdvRajcrMoVPQNMk0bAug3AwH+/8gkvFCEFy5hTxH2uoTniiC/cUMFNcsYRzV51ZTLFctAxEAjfK6KxHFHEdunBK2Uttd8/ksqNrvppO+S42MuI081FEAf84vG711i/ZwQftXSe4aTmKY3y6rOmWFvQJQ+ID+vRFRRUTFDyZkdlzSPv6FRVfDvtK+xLxVHYeC+NXj7/f1T82cQPurDqT//IvXxBlSmrTI61M9BzpaIkyDsianW/v12WZTwEqyUpNFpX6svrURJ8OfXP9G54mlLC8LPVimsT8Na61IPBpYeKaSTPFKCvM5aP17/+GBJ5q+VnFWi2+FO5R0TmRWdS/rLkro0KohMEP71Z1eIP2An//lnLxTe9mVgsyD8T/9dSkfl1iD8lzOqyTehuL45YwFtnGfz7//njBGzf64o9TJMh9fP6f/9P1LVQK6wfebI8yBckf/+DEYNzX1w+2eykkBRCRb5MxWIQpjmGrzqFLML/B9qiv1/UjU5xe65/stO7YQgvOE6G5MeFNe87smS+I4hH5Q3MSvA6es+8SHoH+4uwXgom4PPAcefDHBos93JDTM+6jKJWYGVuWMmqxuw/AZWTfpLk+ws6pOjbeSGbXBj/rpiWttg4ID4mmFvA7YQWPCfIRE0WQHY9fomKSM3pfZTaGKaTcE38rlsytFJMvea3IDrJC8BBLBr4PW3hEdW2+vbI0iXnVmxxnO5FNC2QqXtQUseQjJO4zLK7o/AkoxeayHzOonl46mRT6nBo5dQcEELVw3YszYMiHT9LE08aCUceyHoBsuQyPBoB8YSdcoeteZCOP7lrtRo09VVHnVs53ZYrpwq1ywn1UkWR2L35S3D+qdjhPTCZ03Ufo8otWf1pKm7fd2XCwRi97uWRjpuXqwi7615jZF2Xm510nk9lbWQ5lDdsqFv8Ouw/OKapoEJUStLzh1pzdQAL2dU0StlF79hpDhz5JpBQn+FgH+ojaeGnHrf64JgXBeMluBFr6ixmK57cAf0oRck/eoSrZ7NKi6VIsUiBDxNUZGRmTNHWZSpBZXkc/BbOE0Oa1Q/R2tV1BxAS4wcJG/g5IhfxETQYKDwV+iTYLsCW/Qg+6sW+WHri4u5efGMdZx13fP4QycQegvkNHixBBeLO8/f93tJPfUlB+HbCTp/C389YDt22ksLwkfd2DanblIQ3uqimnguEKfUJbopRn55ZCXgbBcsDmvO+p3CgzkRxGHr9wgJnl3AGRm6ZB/AROCOxDBwA8eTv+54d2xTe6BminS4nRw70JfeUl/6Sn3ZKfVlU+rjUbeV0mtlOGa016ReM8zziBYEb1g2e5YDS5/bisbLPmyNdl79eoAQ5RWyzpXud3vZdCmtB1An/BEenqhavuYjsKy85UkvWU5TcHJz20MEix6BE+qmh5rkYIJ710PRckPogxseelydXOkm3/eFc2qi0KLetdPkaEETqXy75iPMmT+dxvEDO701oIAHA7UznpeYHMRqVvwC8UKFAn4lqpq9Vj8sy0Wcm6ZFojKIu26B4LkWtIasrGiB6TFmtKpQLpLdrk3l+yYkL7IkQvekbmgrVRcrYmbOskJURU4WfnPNeyYYzSlU8CNQ3QZnAMe3OwgIeaaplvEoLsfuNyzjUa3ue9pNDMJXPqR6rpc2MFKk601ca/2bq4viM3hE1OaJbaFtUIHfmAMdGLimANeYWAd5t0ZNhtJzm/3UhCzq/KSmOYlZzj3DMPHZ10rLaFW7xvUv6jnPZvlHK2cB6/Ic7SowszVk81JMPJPyAwsDUZta+00P/I5tuMv1tFTkRyaZ4qnhmbebBsqeH0G4ZtFagzfbHa9srhl1RLrjrXPprYCiRFqTpPWwZTx82SJJrslMmaNzlOL1mEffYfpOn03xqZ/Q+FBWBD3IYGhcZVu9NOAasiQfAdBmhXcB4OXnVi81Tpb9FYsGMtI4fuwlqp/TitGDuDjKG+/EDk5pEUlf2Y0BsgPCILB3LJI03TJexC5IMnCkvDlVbFNuGsc33HQpFOjAldX3Rx4D794ANiZxp88K/NRPaIye/XFvloNxb5b3bGrnK40tvWFrbgdLvu/SD1QYxfavmy6ksZu/55ihSwfQ8m+5uDf6ER86JKnE2DTBSQ/CBz1483PrDQZvifJr8Of7NqH7LSO5US8zPFfPD7V9v2agKgYid0MRDlS9pGvquyPIhzbdNtXWhnfbQyCa4lVfMO35wYUpi8JpAXrtQR8Go8izFrhmAyUrmZWpk97EEXI+HjMBDU3ZTOjYQ0V+v3UfIFm6WPKuXF16E7HY6kKMbk3E4loLUHkTsVj3+iXg7HDDS0CHBf48idAe5ZWVk7bjXdCSefwbVPRo00yV94mG9rBLkwIRpVouVVK6IOmuoVSd3bltvKvS0XpKOSFvFVlc1wla3CGdH9xyqFp2iapKmw7R5JXcjJah7iOX2B3j1kFEg5INUO1HLQDp2UIbwXndqSsfDvgOve4DQOdt+gh4hAThFU1rPV2reaJ9PJic8y2bpJzZ2qvBIqJLaDtdmh/LnHCvbCMecQcZLVnU8UMBiUF49WBJIBTf/v6p+isIbzSHAZo1aK81N6TYXhq3ikKvyrdRY/J1eM3nXf6Knbi/T8V9Kykvckyv8+QQQ9PzRRB6XVQAEqSyXvcWlEsxUhDe7iFLQ9Z7FhU8tgLZ/GV715Bud4TxxnhRNlfy+K/DdcdrfsM1PNCeNECHNWPeAGprLkaZbr8/4IWjm6bj45ZSTIYxfPCvINz2OusQ4ETfdNDx3AtD55hlmkTSHtrM4C83QzsRA/hs0FdIUVllvj8IBmGvib7nRSez1pHHEy+CxnHSaY72toIzACz1VUxAcK2im6oOX+0k5NT6HYQfaBg6JLMchZx20oLwuhG4GFWr0N747YRDfPTyveRwF7Ru9IagfjfH4iVQsVGhFnHarieHO74ACZPLWmbfOAt44A+NjFYfaDLw5Mlrf1wFK3xyK6odAUs3t5BjVXBT8vYwWEqTt3vKbKJArFIBGzxSgQasK/AuDlQmD7RL+KNVyuLrfb5hHrQEENcTGbZWmTjH0hRh2+M4xuM3puNf5tDjX+YwCHeatIY7ccEWwfRIY4XCPuwNkn0YhHfmaut0dLDVGrzVkKWpgi6KVpUOsH2whLCE+MddN8FR6B+gpyP0ZIQe+emaKg0u17p0sEt4vdlJb0VP1zs0eJjoliT7Z72TLife6xsdAhxyr20PQPXOSzsh8bgEgnNeovC9SnoS2ulzCXTqJwThoBOhJJtERdo4EbpmYtG5alFlD3q8B9Wcod8geN76sAeT0QPWmIqoj4AYMuzBY+dCqXuacX7Ug1SFxmyW5IxfbbwY8aMEIrXMdic3mzSUEhQz6Tdmtjv5lQwZA6J56SFGvl6V4LEBXBTCdn7NJcBGL93GCBX9Bf9ba6LOYOnwss+T/EDFn+FJrnwiMXlqyOjx+GYAEmmZG3xSSyMLrl4F32vinkolr0s6tmnJKvBjG1+23R7l7OiiSqlifpTwxaX2ZzLPiiQ2o9svE3Z01RP05qaRpm2ZZBdc6VLWVGicbKlUb48/wj+66XuddNTIlfivuul7nfQXPfgXPfi9HvxeL/65xj93033t2utp18T47nqbLp0R6w90CLqkmy1BKf/qLF2KzqPD2rZ+sq6pEEXgsq15O7ttxS1CpgXt4AneMtctqhFZSHplmpU7L1F/ptydwLYgnWoZixFta1UY3ts+YrMsrnqo0jFWfJI3Kwvdim92krHa6O3wehOqF+uEddt52U2dzsxU+KXb8Y4y2OM31B/5kkxiEh+ROKlYJHa8Bn1Os6A8uCvh5f6+35tYQufS3GW2O3nm8ysm5U+ELdHl3UkeLaoCLve276sm7m95IiMxOcGi2gBL3iBTbbGPfOT21FGEhz0oBqeVVhfa8IAUq+RzSeYJJzXkuSxR7z1RXf2+6zxM9VorhhhBrPcBwi7BcBSmuwX2bk8tFHKgFjbCHpvOkO94YmC58ZhtD2fXfFGz7EBkKq+V7X0LIRd8JI71u0/jNU4eWjc9aFnqu6YftfP6R0aP9d+g6P2WjFtwTZr08gMpNJXnynnpOTGFJ41NdAVY4Wbh4t6cVey4/BXsAJLpf3MGmhvntewuydibs6yI03tSO9SrziJZt7dmqL1+lWXggUB6W1DOFa7YTtvga64ftxz/d1Jjhv9fs1OlbZybCL4f0hsskxHJgKeHjo9R1efBkDKOYjAhmJn4gTPxXqxeRdNkWtHq5LzSrgL1rjejkyhl52C3AM44Xcd9QwcjhxknC0WfW77A3Cg80XoSfN6Lgrg86GOj40BL4ccdaBnAxujccPnWeCJGEZ0HkDPwTZpN438ddhgHT4kHjcuxIdBXK3meO10BFYTf9KHQNlXFihwozIQF4RfDsEyUo0VlohytFaPzlO2OFiVhQfjAA8PQgIiSV/D7fRjchMEnTNVE3YOdypCzan94VtS9ivEiXTLe+uHdGoCBFRUPfABf8L7ndqLhTbCH8H5vBtK8t9Q53sXrlD3tR8uHcMnzI/au44YBVoPanmFN8A2bLl/6pBher5WKUV7ksNEY7tzu9RGbosfdI4r5qHtEMRdmAELVYi39O+0jBWFgkHqcKkpniSsApZR5CGh49lzB/aIUqe4aMBA/c2+zTEo7sbp5egi3jHTDRaN8ErjjJ6Kj/SJmN7pxGmFMPrQ9My4L1KLtBGdU6UG47rhsbITpdxyC9TMIdQRDta8WcRMt6HqXQuP4vp0K6h9uypqVIF9DoElNsERluYoaBqhj0QRwtB0uSjWE0najqMnqAiAfqJ74EE3NrNQd1ydjBm7CKtfdYkNoPZA2BFTY2WsyYrjND12QO72LirT2UUF4tx+Pzg4ud5w/3nJSYPiluuEsm/wvnXCTLE0ycCH7s8S5tAYIxi/Ja9q6ktWbhyf05GkfqT2PPLma2XvT48nyiFZZXd71UHAz0+pOHjp2F6glemh4ytVZdiLfKI0Paz+WSldq13COCUqHk2VqagDL2FUsK4sKnw6qOQNvqG0eOXsaPb4su2cQDe86GsBpttYimlRQZrjZTUflyEl8DikoDGvdceq/LuIBAO97O89fTH7zjv75r2fyGClYlTkuSv52poJUmBbcWWkkWPWz+MfMixz9WX73+c9SySYYQKT81zmlfn22UiPQHuh4BP32bP5Q0Rba6xP0jA5W9YD4C/3nTyx0oL5nm5FUFO6M/OZsBXFwRtP1/fqns5WmFIOSpdvMs43zn777jHz6r598Bz5bnQLvoGfLXg94+5K8ir2hKCSno++1v5I3Y9hGrrWWMq0/9BuNTmyO2+HBEq8i191kTN2zAtDmqrPRaRpJcnXpZI7HMumF1KfJjA/P7ARfhJ4NouAFDd8rX+xM6nTcsSl++J3pjCPL9ptuYFvJlXfC2trJQfi7Tk5azWv049DJ3KU4vk/VnSUxmLtO0iPLWarx92n7Iwg3LJSl8fN4wEWrMp6RfuBHcaghoBCmIsj2sy1f3ubK06BgkPxhgRusXadw0FOsibwipWVK8oLisMvECBtwkrA0vmum6GiFNEmnhYxXeAPXV0mMN5gypfk5QpYZhqU4j39Jl67nCTwjSSFZ61WWzybr2kfhlGohHl8kWRCeRxdp0aLK6/Q82PFlpEyKyexS+zdJwRVf14usdBV7rU0HEwMp97oOvquSJXrFat2NvEfg8SKl+Rz4MZK+Q0iGWt4X1Gs+mg9Vb2Ns09nkXaL0/6A1lwmZgWVloVrKYkhBpsZKKWtxFDUp54kSdUU0B+qcmdR3CGhDi9nuHden7eeosRZ/K0NXW2RUeVskWeth9re2P1kd7xp0SKT+jeGLFm4nEWqr5YwLFv9uFQe2C8pJndNsmszrouakrKcpWJOATZbfl62MYGF7s30TvI7yKfnnP/84+Y1r0YZbaK7C+f2m0Rj+/NuvdpSVg9TH+/yPX+0+JM+j9Evx+eef0W//So6TnT1lv3NEsdY/2ydmvZ94BJ54tTNd6Yv31E0KwodffPG3P3zDwJ3BF1/93dl31ca+fAFGjLQCD3WQJO9g0rKorvL2AqW9xkmTwNDMpWPv4garPT9xxZK/e6SqDibIF9QPOT7n1S92nAgNw4Ce20eOBqXytNaqgqCI/L4Lo5EhpcW35Md9ENBK0kL9ouS3e3AVq2h+sNlDhcPvXg+tjYqkGy0JW75nMPkYUrGoqOI1H6Bi83XlUFBq/SR4us9BpPBEegFttdwP5ZsbxhC1Bz1AfaomirbctlAWL9kBUZcpeof945DfTOUKbNB5pokJwm/HfHmOllf8iAKTVQpM7AL/MFjgiLvRpFitmNlIMTNdzP0BZ5AHSZaQg8lGP+Sqh/RGncfFHcsJo+KjWrvKy1zUU1QY0Y+c55sobzRWgba19wNUkVmSyZonebEkEx98QSYbnmTkr5LokiQlcSSkB0ZVxL9/Ov0Uj5Pvvvg94N/huTSIWHNcGeooXV94PPRhlEHwj4eL1u/Fz8YE4bMVymmc0AV9YHQ7agAfeoBymzFAPr+HGRNVEnF/3RUxCB8N5WzK/60HJZkNDBA4QG392fnzNp/whVhXfrR85SMpCB/052pK3vVhsmnPqAKl9RHYzTPY57CrV0Wf10dJ9Pd5k7Mp//GoR0r5tnAWn5dw6gbh3so5aQ7scJlEQfhk1Uw97TRcY8r6vx5B+WtP9N736zNlD8If/1mUu+rP9va6k73puSbn5Mfm9G8Wnix+oLxKOqvNnN+o1gqC7MbPNxauIf2+Obl2k9k45yxByZBV4KwZAA4dpAopY8o/KBVMe8HUT2IqTBkwe3ph2x421WsabJS8XSE2pnFEHKWJZHG2vDgu4+7BTur/GAIaHjLwYpowHUk+Txk2etMLhLtp66K3je/q+AU9X9U5+Z7jPf2idertXKtYxPARvxDJLJH2Mlcsd5ficEKeu0k75Pll17HmV52UnU6Km+tlJ9cLT4pbzotOOXudXHudXHudXLudXJNOyo7b+Hw5K/fsJNQi7DoPPYbgs7OrnvRuWp6ue52MVmx2o0PwJk9k8lXL3a5cBFt93j6Bf/hDkrJet6HS4dhn+CCXLNnDAZef31ZJRquTILyqHHoSUOtWIQE21UOutOUpDEviILyijVoqCqryEJRl09kg1V6CwO/yIn//570a/NtYkasz34PuGldxCfrPFZ16wi1Lccbqma1TOWkb2Yjj+b//dyv6t6uUbNhrnTZ/B+GLH5lXRlz+r2dy9riq2/6OM02MdmaHCRhs80BZoDuw7jrt03/ecQn276eDZOmYvfUW52Cl42CS0h9OlGc80BJwUaC9kLE4oU/7HP2B+616mcrA8DK1F9s4BWxTP1gJC0ZciHneB4fdBW32YnBs25Le782Q0iUl9SI20b9ZAY3ixhR0WZNcRjBKipz3V8zOicZn8yqJ93ozoBcU/1ee9WWSw2x3bT8YzDQivrvSOMwg9AIaXq1UNiiIu+APV4gxY+J7+9KOSdOSLmEGadSMzNAt2xdk42aqTFjENm0iKguAbgdsP5dMT5HS613rJxIVYuWGCBe1T5FE6zgp7GoeLRJets43+xFB+HS0jDb1kz4sukSiA5+TgCB8MlZCm/jnPqh2kcNLxqLFwEdtYBBOVi2xJe6tmgVGSjrzDsJnvZlQ+ltbzewdw0Z7o799EjEwhk0Z7nY0hDWb8kUfGjwbFlU2OMcaTBD2ftUop01/I6NJflG7I+XoQNL4CXe0a+1PlLOwfC4WN+1ENJOTEj0HDl4pigocO7Z+FhvxsnQ2SZRr020/qHFzqmAP/DDUcNOYR36MZpAV6r4fZdbplR8ixeuHdVIx7UjXdCypMj/vz6y2FniNzaMTneHD/gzyIw7+aT8eHWaiCa3CftyPZcfgVZLFulaepsCcAEeqxhRRP/UUUT/tKWIkOlPEoMgpsq4TXZ+474HbDvBhqr5t/oaPXzd+t1/fcFKNz7sZ5Pdv2v5pJZuLDmpvejzXSoceDgW9r3op8l0ZKRumV1a7uDWHhOUV87mbxfiOmwU/5MliVOCuduDqW4lHdDlIz8rdrSE6fPChDyBtwqUbFPjKOCgrdx+Ngoa/B95eyNHI9zRo8HsaBN+7P4yCr41BsnL3wQgEvnS7FwMfGaBm5e6dfioU/cBw49s4RdDTUb3k9GFw/o1gcMIpjOlN2JnyLsmd2gYJS1zOuJvFN7WBhCueF3UVMV3yEB2KeTRAb7eWJyMoY6sZK1BuPWsoAOGLok5jgv5zpOzyie171woUo5xpaOpTG1rPsxYDluTIZKiYa4872I6b33qeoR+5Dq6TFNopYF7dKQ0Sg9BBSpdzcU67jXnc8Tns80MchC9cJQd9ull+iG0S+jXry9W8Yg9gGtfDt11MxY0SvNQmb+BS0VtxjdHpoQObYh71Aw3UHQ9qlNxUZtclQ6iYJOaeXlQUy2Oyk6f5aj+k+fLHLiRjmZoYYC/W+bxJDsLHw7mbiozgmtp8OoADl4PDFQKEchM9WEZTrXFoU7OONk8LHayU5aK7m7N/lpmophbvd1E0934ffGrf9aObb/7WpSsPZqAK4CnUoAbh9mDe/hl4IL1fGpB7LgQu+2SxCqLpl05L5ctuU0IPvcnf6X2I78XdUp52UKmvn9BZeWfBR6nZLw+9ymGgHWqAfjeoQeb5skUPws4W5+RvPtTZBBAIOsb+NWeSPZuAnbt/E7Bx/ZuhwvVXxLMZNnn6p2ID6V/kEkJi3t8LQPQscjNn/yI3UU0tdvyo3hoEYWeB6Bz9S0gj+peAdDQD68C/BLyu/M3D4YNVsXIarQHc4xxR+R60HNmj3p0nXXmdVyyK4279WERSRHGjmw42nx44xkbdsNN1AHHIsuknYbYeGjbO8RwPznikWdFNHwGLu+ejNF4JoFBvXqTc6VJAbDwHf/I0Y3f7yfjpAXrfhw96K30wWukDSXHiA6AzfLRvhIIf9hCtsvtK8A4BELFoN148EKxifTmR4AQtaIIZyFl3q48KQ9BLhEnRWy7Wt5fqG3qDiiEMnKHNkqoAPQ6ynMhK3+mne2aOSfbNHJPuG6GGLl3g9BA9/dXQ8Kt9RN+Ey5K8Z4VJytBklQjf0LcqlTLAVi8VP/ykl2wKYPUJMgKFLXB7FOWbGwbMN8+biB7lpo+gFpcvE/aTLwxInHDRieUBYTxwjP0U6M8NL8W3WSsStsepduurmjOx4adBNXpIUI+eEn3bv6ZhTe710HBJ4oua040y+oinUyQBP+h0cIy++LunHaRDQZ5kDEzXTe4r3TdJMN0XHAWGWtbHR/Dt6UjoLICtAZC3QgDwLV4ZfMVXI0nBIMs+gueYlgRsxCMfZawVNgqWxr0hADbn/iACh8BbS8y84aVgJmcnc1xsOVsGaqiABlspe/J2Lxm6s5/q2SQNKnZsPxlbdLefjM2ypjvydpjtokzOlenNBf0Tf1kBQI4hoJkvcM1DH8qNlPKhCTqiy1aMFoMj7E5okpXxqhIfDOPd6lgtEzQ9SJinEiMoX/s1yv1gYIFeSN2ByvPNcaD67OMe4GCoIIiV1PnkAEJ9a8tFDPYnqtL4PjSCUh8LfCh5jUIPR82fD33AwY4HE6yV+tMADoZFanC+aDwrIP1NbpHux91KTlOWZp5Pj+LUh7f9OPezNiwr0jTzxcQag6mPPvLCBuMwcbCXE4skP/AumpWw6utP+rHDvQ2OxlAYMNLbHpy3txuc+9lO6LJfe775wAManKoYAw0di4ztOiZytG4vV6nby25BNiaPdzz9db+LGdx4KjajkRjbojVqsEbQ/LGWuRhfrSVmcGBQGWqZ+qPCBX3IwSWqgGNrr4ENbpqIymUQpMF54wX6dlcDOLjkEOfvl25zvb0yHMpPldUZVM9u1G3oC6divT3iAtVXn/YAfSddt1deeJvbHd3RY7iL6p15qxzDGjg6PSerTc+Jb3p2umPiH4tRXN9kmqw2mXxHeWcyeTZRO3ak9wAfgqgv3etABiuMEXc9XxoG+VqlQIOTDzE+HmEE5duwNWr8g76jbQTV+0HPuNlFLRL/rBtBeXsU44cOnzYupqccXxcMYnynlsS4zbc4p5Lm81raknm+uApUfTjshQ4u+5LGccoMf2Y9076oUK9jeNp3QL7OVaDBna0oWe7nyMdgvg2wgQ3yD4CiiRtV1ncH8SN9+72JHO5el2/xdm8Pc/PAAxrkygAzNr9djG9+S8xow3xraRjU17Cxq1zOCowNPHaI+XC+Q6zFDU6dNszw2NTxI33MnUaON6WL8zdF4waP0az0dd4QxHeMImRw34N/wSuMf7BWgfr2PQs6OFMycNtBU99RsO3HDc6ALMkTiFySjQow/Ejf5mEiB3dLAEalbxt87IH5TshRnL9rNG5wB8iSFXaADsi3AyjQIDuRsTStfQfHCMrHv2iU+8GrFoiWYLZuZ5SRwEea7IJ8RxeCRtmxLso7n2iymrjUC/TOqBY4KC61HMDSNEX92W0vopPmLUg+B8qe56F0V/f69fazLfLln8gfvvz68yfPLFmr2iruumW1sdDxtcwO1Y5/9/BQDzvIscmrQIOTF//eGxvtLso3eTVq8AaepjSmPSzPONA3JQzgWJ/Fo0ukA+rp2NjTsfb0mmU9d9sxmPeLM+82P4jxSU3RAZM0yhk7A3ugvi3DgmJXqP/CXtSgzPj7JKd4opKl70jow/p6aCWsbzJ/v8qG2gH5xk6BBtnj72niE08PYnzsscQMLgOAjB6OHZC/YQgaXO7SqiP1zszHPcBBtmdR5yc1zYkthPKxPX6kb1VopH+9rgL1cYYWdJAznFfFkq0gCPPhfGxSixucdPOqOBibdC7GN+kkZpD31ma4/sq/74NqDfJO/VZEq7KfDaEHd3AFHu3sUuSsOB7b6D0w31bawIZHrhSjkiCJGW5hmkkF3pGqd2G+FTxPs72eJTSK83ZsgxvuizTz8S+DGG9/Icb9lKWdgKbXrRem0Znswgf3ZUSP7csdkG9fVqBBRQ7lLZVynoDbVd+NeGW8b0vt4k2+oNurFnSQY5XwMY61i/IpRGiUWbduf3umxXYHtOsTm4zBvDuAho33wqj8XaPGixq98HVRvR8c4wlmNI1AHrXj+eY40Lf1GMDBpkrcWFO7KF9TNWqQW2HHFOJMriDh9SN9l2oTOdhaCRxrbRfla61GDS4ECfKtzTGYbyE0sEHeidVVsYr81YfznTotbpChYVWesD3yYgXuTkNHa+jBeWvY4IZHX8WCGxn9Dsq3vjQKv/JqRlPOXvu2S40bPOhi8Hg2doYp0HBBheC+PWQY5P2aBA0Oo3YpNDaMPpxvGFvc4A6iYbujYl4/0reYTaR59AV9oMHbugZO8Elv+Abeh/Xtcw127JjwAr3D3ALNZjuYKBljJ12Mj52UmEHONZ5WvmvDIMb7KcQMHrkQWAucuI0KYr1A35ZgAAfnb1QsWMV6RGErIH3XOBPp02sJ+sCDp5cCjp1eHpjv9Gpgg5t0VMyX3kfnEZRvVWvUyESIGV+w1Cc9GQf6J0IDHO7eBRXz8Qd2D8zbvRo23NoFzVjKvCzfONDb2hY4eDZN06LwtXUY5Nu0FGhwGk0TkTMfCzSC8k0jjRrcuno4qVsWhjZGB2jp2kcEAzd+p4foE6xNaQLeNFbYUvxI32FjIgcZvxbo2ylWgQ43aUzfYEqTaFHT0cf3Fjc4c2iflvJDH2qkqEgkPouQEZRvEmrU4BqjVcRGNVg6IN8aU6DB/YuWrBK1T0o/BvPtXw1suIWzFXR0OiBvC2feqb1uYMBWHsPkQPz4DYugYthIP0nKHinDUK/t31aysmnPyvQTlSxdblUsqqsKAsY0dvWnwwD01zFcQo6wZ2MwcJkkbaXQ8cMwGE2s0N2PDwdR1qFD0M9bT1kaozxMCXp/HHenF4JRcftrww7Rt0+W5OMYerw1hDlgrLw7BIiT5WA9o+HsNI6f9NFVyrRi9CAujvKBAcD3eOmCfxgzw3DTvZ2PGJwVt/sg6FTrc4tquH/om8keSBD+fryUMcSLPsBABdDLR18uYyo/HEPBJJ30g/ooA183xnEMJUdyoI7tWP7WBxoeqGaMPhrMO0B86qH5PxaEW16sMRR3BwAwCoGX7kn0f8no9gGA7HF/VdrOVsa6ZvAl+PFXxtQwHCxV0G/vevFSg/Cph+rP0/Smg+32phcAvbnpp+Ou21N4u+WOAOjx7V4AbLa3eqlxsuyvWDSQkcbxYy+xu8H6K9+dHj6ANT18AJweD710Gco9lz61gnDDC8Kd9zcOKeYDc8ggBuHLoZz9tLBL8n6o23TpM6mddnf66TDr3EYrl0sw6fwlt3NumE6P3bnR0GHGuZOqIcbJsrdOUX82GsfbPlp3tnlh3TRv64w52U+XU9Lb7+2MfOAjOxPypg+D89Et3OFD3enu5T/dBrh8p9PVQ3tZh8/c6Kff6JBwsnW/1k60fho9XvfRYIKt+QhxsvR+P/LDaRzfd9O7E6pTPWOW+GlyhnQ6qZ0dnf51ZsZ1l46z4p6bKq9aUiaJOdWBlhTKPfSi4O0GZqU2h1+TCvqiXSykogs1D1b+Le+LG/2I+w4prrPsxM69OQAJGxpOP7dJTSI6cDUT3QY1ic3asJH4p6zPeh/9H5KgfdKIKpnPwXEUFaBapkKHLlkkiupVC9Uh1NFnW8TQbQgE9TqCjItXr5sjUpdbmtGLSFWneqJ5Aes2TTqIg4uxGrY2+hauUpj5XLkBvt+PgCCO0PB+iNQ1TlLW/x3tbviWg7B+3naIMloiOsxMhBZNWdRG4YUT2BFzwLmVcHCJWFx3ENLxseo9FU6IREtwCYKhtTF2DhQjgzGTJU1rxj/4Psm/pxhOs2akziF+CQRVhlnZSQvCrX44hCoOwqAfgDFa6iQVSc6D8GE/EDz9L2nKcnHLAmHA2vZTN2yiTt5wk3UArI8/7iXd+3jdJeVFzg5rmna+kuTL4oB5kjmrxJqbDOGsD9jJHTfd7oxNl0y5CgwVhDc9NAgoEYQPPJSiihlESSim37NIBGGnXZSD5qinm8B/GYQP938RIsf7M9GqoifueKqoVmJ/v86Tw5qRBeWLILzdA5Ij96iHavfVvR5UO2vu9yCMTt3qh8i+HQDIrrAnuuxuY9XoBLdVLdD+/bAHNdB9LUh2X18RCcfs4PAkCO/0gNQ87avs0BC0qHYIbvYgqDM4BqUdnCf9EHd6b/VD5TDZKwsWddthD7w0u6l3vZi2oVteutGYbQtwcATx+tppon67dWlg1vDf8mNkY7b8xLam9qAleXd6bfgQsvT7PtJQTymI0RH29IQQmUY/yJ/udzTIquWmFyKr6afJHfuul9b2zx0vvdkQ7HHEndKsv/ztjmMDGxjHBiObcMdP1MfRQz95aH02IGMw7vYi5LKxPwNpRmPlT3ewNGhgsDTEt/w0zW7JlhdjNMQuBM+ikf5uMLIWPUQMrSl6Srd21C0/pp1Y634AdVZkS+gbJhMhh6nn2+2p/EwB6pxWJxB5qNLRH07dpPZrXbB9PnfpMtqoNNDTC0Vya2kiWAVRjk+t322/OzB7u3GI5mcuaEgBjK0+MgQGKjSb6aS0C6wDtU/RDtn8+PMGVHU7tpvYrkhfBvndxwMI89Oa71AsSdu/dkLLLLhAe/G5VPNT923M9wW4yiyk01KWsVyw+E4DoQKT7BL07YKXePO0uqmT1k5nD1zWWk9nGb7RLs5JaqdzF2xP5y7dN53hjmm08tT63U5nB2ZPZ4fo7Sn5omw3zU0zeqoLl5/c7gf4JnLFIFz5UU7M2LHdxHYEKppwFttwJ6m9oZVVAdd5d8ttkn2TzhYaWD038UIyuB5XRkshNHINeOO26WShUVW05W57QZhoDrW/hjMMrKpBfkiSCquGbXfaQIzIXCVwYTfBN3zg9iaiuN92R7AT2h3BBdo7gkv1DY7C+HYE/ZG8KMruStDTvDNYEG3RTWunuQduT3MPwKy3Ph6cAYeP2int8dCB2sdDh2x+Tg9Uyo7NmMPX7eSEk6Oiitc7qWDZOWfV7xXhgJ0ArpnOdq8NUNub1GARsmHPV4GajdQdpWrrTqeHfWSzjAY0swbF/NnykDZIfuWel2Z+Qk+hJGa5SGYJBvZsf7TSDhMgC7/roZhF633MWvrunu8QvfmR/e5hgRyimV9vHmpfMXvQTWob0wXbp2GX7uvNzlbmLkgPwCznmoLFbEbrVEhhpB5MEGkmOYpdnEqGAwiezHPoIRm2/PEA0nfugnY2zHazEztp7Ybkgcsa6tUc0ZLDym9Y+aAhpKn9FSuh3aVdoCz/iUm1NgInpd3JOlB7gXbIvkWOD0jd2mz3ke3BeNgHMz+lJ+g0pfmBp756pKZJl+XupLUj5YHb5528NakLo3OYbVuY9mS1frcMjQOzF7JDNJv+XnK4Q3hRQRzZtGTV9hyucxmfy0eJih3u73eSgvD6fF7PVBBL8JECTDOrbmIq+kuRCY2OybP5PEvJEZvOy5rwBdLSZKoeWkse0ZSRMikZ+Jx4MgjGPtXQ94egvM5IVRzxFdE8IxyeDldGR0W+bNAfDKKLdMngkWvFwosZ+K85XhENIYrNZgZj6JU62h6TwRpUxRGB2JMNOhxGl225O4PIjMtyszptcjwdzMFKRtsGPh/CHtY0FxAs8/Cj1bqupPFqJUN1M4g/w6Imw+4qGZLYyvPhink0/uWK+DkVC3hsXWUMdLYZ5WK1bpqn9WrTZu5O3ME+mqWUL2S4sJX7yMiz0vSJ6gw2jZWaGZUnKxZa5JExJwex6sjQ2MFtk1Zz3Lg1eLIKOGPVnK1WF1rNzT1oGBvH5kS8YWLbibdhJtvjuYYkGNi4EEQcTshzWJdfuek7Kv2GlX74kUx+7iS/JF/50C/6kncgeaeT7C17z1/Inr+QPX8hu/5CJv5k1fjndqfky1m550nPjnX6upWeHO6RY47ldwl5ijluOoRdcqyyrHUoMt3NMWlyuB+ZkJ6iJsSfvtObnmH6ZSt9Ott5eRVTxAK4kBIk9zk7uohpeQ3qKHki3sWfCceUB/hD6v+ABKRGrYuoyGNYjbKca4iJYOaWuxMiCpLsTq53EuH/WzJVFTQrqiNaxXj8z3Ynd5GoA97o9XSSR4uqgKv6Qy+dCaVRQyhgt3ygis2llgXN1NbVA4jZEuSOUVHn4v44cN0HgY/c8xGsXvRmhTA82z6CqpcKAsRJUXqb4cLABsbbawqIZ3dVlPzBCAja9GgEI9XanoygYsajKkFZ5Bh0Ws9mMnCjf+gVlC3h0pezo6EKShD0r7fjjE817X22ChDOAZ78oJjcETBN0yJC+PurwZN5Dnee0ZrIgmWKtxcUuF0sQ72QsawFDhU3b1De+WOgwBbSO7EVBgZG/e1dwAqGOop+gBG7y65yVqci8Xznbj8KP3PbpjMIXN/uRfc9VGcn8kDmDmTDD8HwcF0SVP5hN7m7N2yPg2BneNQLU2qkSPA0w9097g1CoDUPBhFy53h/EAP6l+acDwbRxi4zDDRK3OsCW02/PpKnD82FCY/SBReeAfHtOE/GYXq/eTYObXebp6uA1V4zUgdzp/EMamefudOLwXh1numsyCqoZXdzMUHtevJMQWf76f+UsSn0Vxf3BM8UlR0SiWNt1SrFPrC+blnoSDErNajbstldL7FlzO546blCOAe2JtMp3GRs0ZKJqVgJesG+ufd8FbA5+uFIhnYOPBlBGkP9yAPtcmbdvrNRWx26ZL3KlMrwkfeHANJMuNvBJkTycN0xsli8e12y3DEjuBWC5PO2FzFjVNQV49c7VKh7t2LdA6DbjeOcoYEyt/9uI9zdv9uZna39gyEIOxaVXmYc59njIbixtQ/ijHnbXQgK12wARSYPmFJ45nXfCug2vDP1uwPh47F6C2r3t+6Udra3bhebjSuFs9y7s6i7GfZWCwQ8slrdCWxul78G6v5+VNagzABLHlRpkP0RFU0EfzVNi+gA79XSgEGi/uVH53NulCt/+CX56kwfbvKd9cMvzvjhFz/1w3tn/PDeT//w2cZ476eO8eSMLZ78xBaDlOksH27znfHDIK06y4fbfM6HdzwFmLs2bi37+8YB5KuqJ4dxH5I1uTJnOREgl8IXULAxvzYrKhCSllWRlfCOUdH84KFKNKxvKsbLIueMFDRBXR3x1iwTZFbeZNnRvKz/lP+jqA4+K3L2aQGPiYLFa5rytzyiJZy58edVVVR3dPp37LBmXHyGp0WT7a5D/kTa9TT05oPf0PITuOY1lE1NkSV+XXDR0NYl7VPkPv6CUuRvirhO2RWTIDNaSb/HHt1kmTwXWQ6PuWD9BTZOSZYIfqtDkyJ99AxxLWbNew88V6GEuZu4Q55fdRJh++2kvSRfddJeeNN2PGnd8vY8efc8efc8eXc9eSeetJ1ug1F07Cai3Pi6kyiFxr7UPL3RSUVxsVsuyoq7WBQUdwsGKXG3hAnxJO74E7O7MctoPgdnTaTO2XHJIrA+W9A8TkH95o5BF6zKkhys7RryfwNNiyInJZsTVvIkhb9R/+3ZlkGCQMLCRwBewZOsnuG9RcFKyyPmo0WLIvFT4M1TJMAp+qjUXwvQNvCiT3Ty5ToHVQoWb6VFPn/9ejsEIKxi+BIqlpGiFmUtUNkEVKH/Uw/ANudsQSPmnDZwTVWTlyyqU4ph14GFf+pLz8qU5KDhSTjqVOzvxxWdiS+GsVkRK92bQUwQBiuUgx9cBThl8yQPVwDKEPNfjSBpSQ7GWwGoIHyyUlnYktWg2JaREVFQ2ZqRYpV9NtbgX1eCrgB6vw+Dn2lmDFxhGee9rbHR+OvfVsOugurtGAlCJ5qqhr2TzIAOz0YDODwbDaAcv5G+1E6GV+tLjV6lLzV2FdSKn8WmP1sNK1v/WIOjBZMG0UtWCVDWJMuEJ0Lbsz/qx1VMKgdVbDaAgu1aqvPxO82+LANbPdtaFkn8eisqci62w2u6EAqzCK6oRc5uqsQKovzJ6zFKdnNxu6FQXuRwEk7rWGrScCZu9VHhct1LhMt1b7lYn14qmtzf6aVip2+a51XFctqcP0HooaFkAKg3FK3dhXBI161k5UAECLos8JWklUW10FEfRq0GnPTjpxtmyPKUHwww3t9QVOj7qsAna1FUqFb3UJMWYA5XneD8S2ia/ACG6XhACvbAAhVFyolqeXsduNfFSM3+BrFhIVTRHJtyz0+SjhBQmfC6iYBexsJ33FQIvgYTF7S3sBHYZprkrJIKt5t9OTJabvXRsKMpb5ZdA1BhKVzccxeHfj7QfuFELGCRiBMw69c3Mf6b3gzSQwh2texUsNJERidB6+XdH5EzpQKycGs45fyRE2qezCkmLnfv9GKwyY/6yNp9NlnukonVoRmfd6bEAwdA4mQ2ay/I8Is/jNKkVB4qUxVor5O0iSlSPnxS1KJuAosH4U2TRnkTeiII7xqUo0XCS1DfzqOGbpbKBSt3jVI3TFoyT5PSmw0jpvdkQxrtzTYxspm0MoGrfku7bdKcuMlBeN+gNmFelxNiFG52Q1ZMk5TlTCxfNPRbJl1G11z6MyviHnnprTlEymwjvmfZRh/NHrQ0pUvq7UH0/LHnJUEkuZ4OBNLBxN8+GWJs6e9dFa3LoJq9qwNH8ZKxaNFAHnQhe3hKN/6h7dZCjKGlt95y6S299Za0epDon2qSSL0NVuE1yAtvzv+3va+Ajirp1i33xt2dBE0nHcPd3b1JQoBASCCCuwyDu7u7u7u7u7s7w6D3dicwMP90z8xb76771npkr5Puqm/vXbWrduk5ddrxiwjfu9r3rvC1H/gez/TXuPdfJh0SGeHYhQqN+sva/eE95j+Un2MJ8i3g4Znse+Sr39V0zGDiJi7xS8TgoOiwEMd9rtCOhRxgHmf013ViXK/13TE7x6q90B9KHHxJQ4IiQhw/aBzpODcTEuToo5PExwWFOKdzITEdoy3OnbcOYTEtHcHkzlBMy9AIe/OwiLDolvaYoOjWqZ2x8bJxoOO2QUhMx7TxSPwLFH/AghznozNFhEe2bBMUEVGggLPnDwoOc/TEVm+7l+PkSUxQWPjXw3SF/mCNszPa8dCl09K4RhAU/ieWPM4UnM/axx1WjV8+xz3BX+jb/DD63zCH/xvmsH/DHPIPmP+o/H/C/G3662DO9jfMLSOjYop4uGdy7HDEbXNkcc8YFhHzdwk6T00Vye6eqVlkbHB4aJGs7rkcaJFcQbExkd/OXTonOxFxrw5y7Cw7v37dFvL6nvX7781CYxyHJmOj445XOZ4DDopqHRrl+zcC337n6wepbK6k4tp1XOhH1RFB4Z06x820ouP3yENi/phDxemN9vAs+A+kvh0PjHv1wDdZ/38jGx3qmC3FREZ5eBb4N3KOhc8fSVr/mWj0HxI+biRCWoaGtLa3jT8284dMXjcy3wfj5rCF/g23Pf4OQ0RkhHOKWvT/RNjZw0U4l8r/RP47dueUNTw8ND7rLorn2zrQcfzpz3EenoF/IxN3pDnUHtMyLKK1YzUZGuF4fUYzD8+Afyj5x0I0OiTScbDqL93UraBjyHJs7Xp45v8r2fjV+HcGxsd4eOZxy/+niIxBbdv+cDL+h7CHZzL7dzdJYsLjFgspf4h0PnnjjE/3F/HOUc6xlv0rodCOYTFp/iI+JCooumVos9T2/7hDExUaHRMZFZryPxHnIwiZv4+PinX4qN3ZXYR91f2DzrgG1CYoLDw4smMSu71DUHSbuOVQ3CI8cXxU3OgdExkVbbHbo2OafX1dovkacsyIvgUcyXzjCwmPjA5Nabe3jTctOjS8+bdxOpX9RzuaRcbGOHVlsdtDOnYMCg5rb3V0DPHV4Xx8ICK2rbMfzPk9S7PQtqERzeKOQP+J2ed7Pru9fZswe0h4UHR0/JN4Ec0jHW9ecP5qQHCoYyu9WXTMv5AJCo5s73iBakyRfyDjeHNXbERQm+CwFrGRsdH2trHB4WEhzgc1vH8Uj/4HufznIt8yWfjvRdzkMdeP0m0jnfX4vbDjOGCI4z2j+X5kbR4b0SzIMR4Ehf8le/4f2f/W9H/I/83uAn/D78Zoj78R/WZDOiejvUV4ZHBQePwLfpo5tqsCA63+rkGrzTUY4O/l4xr0s/m6A61uQB+bG9Db2w1o9XMHupP0CnAN+ga6Uesb6Eatb4Cb4vMNcFN8vv7uMuTnLkO+borP1+ZOrc2dpI87O73dqbW68QRfdz5kCwx0B7pRa3NX8DZ3BW/zd+OaNj93av3cqbW5M8XmTtLHnaS3G0+wuWsrNqubKvPxdmOnlxu1/oFu7PQPsLnOrZ+/m1bm5++myvz8fLxcgzZ/17n1s3q79nhfq9W1J/h6uenebIG+rovPFuCmH7L5+bs2xWa1us6tzctNc/Dx9XJdtj7WAGtaV6B3gGut3jY/13Xt7RXgOkmrn80/vUvQ28ffDerl7Wt1g3oFBrpDrV5pXKD5An1Tu4RcCgUEZnIJBThM8fN2LRvgGvJ3DVldQ66N8/dxDXllcAX52QP8ra4N8AvI6BLys3vbAlyXm5+fa8jXtVabQ6vNtagbyI0ZrkvUz8ulT/i5zKVvoN3HGug6PV/XxeIb4NKdfP0d7uTGMXz9XefIzzGTc+0dvn6uk/V1JuvrWtbXtazNKevjqnfJ52uzucFcV4uvzXWa3s403ch6u5a1OjsfN9XjRq2Xy9K3BdoDrX4+7nAfa6Dr2rG5zpDNdQu0+dsDrW5czebaXWwOd3HjTjY/x6DhRrXrxm1z3bhtNkeqrvspm821qI9D1HXl2NwUvrejabixxdu1qJc9wN/HdYO0ue48bC67XB/HRMh1dnxcF4KPt90W4O3tskH5eAe6wQLcYK6r08d16fh4ObLjuk58XJeO69ry9nfMn1z38t6undbbzx4Y6Ou6V3ZjpbebBN0odG27t+vGbg10aYE1wOFvrhuI1XUdWv383GC+bjDXpltdj4BWX7tfgNXHZUdr9bVbvaxern3V6ut6YHDX0K2uxymra6+yejt2QdyUnrfrRm51Y4SXj0sXt6Z0gSRxxAfZ28ZGhdrbh0XFxAaFm7iooBjHhmx2e9lKVUsUr2S3R8cG28vHPePheKLDHr93HJUvpG3bzHXLVqsd99h9eefvgXb/McLD0/PPHHXDwsNLRUW2rRQUHVO6Y9wOaI3Q5vGccc/r/w0nABAggAEBFDDAgQASIKAAAhoYYAEIIJAAIJAQJAKJAQJJQFKQDCQHCKQAKZ0oAqlAapDG+S0tSAfSgwwgI8gEMgMEsoCsIBvIDhDIAXICDyePJ8gFcjtTyQMQyAvygfzAC1iBN/CJ12cDvsAP+AMEAkAgKAAKgkKgMCgCioJioDgoAUqCUgCB0qAMKAvKgfKgAqgIKoHKoApAoCqoBqqDGqAmqOXUVRvUAQjUBQjUA/VBA9AQNAIKNAZNgB00BUEgGCAQApqBUIBAc4BAC9ASIBDmlG0FWoNw0AZEgEjQNj5v7UCUs3SiQQyIdca0Bx0AAh1BJ9AZdAEIdAXd4nm7gx6gJ+gFejtDfQACfUE/8AvoD36N5xgABjo/B4HBYAgYCoaB4WBEPDYSIDAKjAYIjAFjwTgwHkwAE8EkgMBkJz4FTAXTAALTwYz/LumZYJYzdjaYA+aCeWA+WAAWOmMWgcVgCVgKEFgGloMVAIGVYNV/l/JqsAasBevAerABbASbAAKbwRawFWwD2+NzgMAOsNP5uQvsBnvAXrAP7AcHwEFwCCBwGBwBCBwFx8BxcAKcBKfAaXAGnAXnwPl46QvgIrgELoMr3/QhcBVcA9fBDXDTGboFboM737BgcBecAvfAffDgW9xD8Ag8Bk/AU/AMPAcvwMvvdL0Cr8Eb8Bb8Bt6B38F78AF8BJ++wz+DLwBACBHsBDBMCgikkME4jEMBBZRQQQ0NtMAEMCFMBBPDJDApTAbRd1qSwxQwJUwFU8M0MC1MB9P/gGaAGWEmmBlmgVlhNpgd5oA5oQf0hLlgbpgH5oVfvnzlzAfzQy9ohd7QB9qgL/SD/j9oCoCBsAAsCAvBwrAILAqLweI/4A4qAUvCUrA0LAPLwnKwPKwAK8JKsDKsAteAqrAarA5r/IcMAjVhLVgb1oF1YT1YHzaADWEj2Bg2gXbYFAbBYBgMQ2AzGAqbw14/yE0HLWBLGAZbwdYwHLaBETAStoXtYBSMhjEwFraHHWBx2PFPKXaCnWEX2BV2g91hD9gT9oK9YR/YF/aDv8D+8Fc4ABaHA/+U0o80CA6GQ2BbMBQOg8FgOBwBR8JRcDQcA8fCcXA8nABHgolwEpwMp8CpsD+cBqfDGXAmnAVnw5vgJpjzF2UwF86D8+EC6LBpIVwEF8MlcClcBpfDFXAlXAVXwzVwLVwH18MNcCPcBDfDLXAr3Aa3wx1wJywOd8HdcM9f6HVFe+E+uB8egAdhCrgAtoCH4GF4BB6Fx+BxeAIOASfhKXganoFn4Tl4Hl6AF+EleBlegVfhNXgd3oA3YWFwC96Gd+BdeA/ehw/gQ/gIPoZP4FPYCzz7Fzn5g57DF/AlfAVfwzfwLfwNvoO/w/fwA/wIP8HP8AsECCKEMCKIIoY4EkgihSZAjQyyoAQoIUqEEqMkKClaA5Kh5CgFSolSodQoDUqL0qH0KAMqDjOiTKgXyIz+ea6yoKwoG8qOcqCcyAN5olwoN8qD8qJ8KD/yQlbkjXyQDfkiP+SPAlAgKoAKokKoMCqCiqJiqDgqgUqiUqg0KoPKonKoPKqAKqJKqDKqgqqiaqg6qoFqolqoNqqD6qLi0EH1UH10EzRADVEj1Phf5PTvqAmyo6YoCAWjENQMhaLmqAXqCluiMNQKtUbhqA2KQJGoLWqHolA0ikGxqD3qgDqiTqgz6oK6om6oO+qBeqJeqDfqg/qifugX1B/9igaggWgQGoyGoKFoGBqORqCRaBQajcagsSgpGIfGowloIpqEJqP+cAqaiqah6WiG09aZ/xet+55modloDpqL5qH5aAFagBaiRWgXWIyWoKVoGVqOVqCVaBVajVajNWgtWofWow1oI9qENqMtaCvahrajHWgn2oV2oz0oAuxF+9B+dAAdRIfQYXQEHUXH0HF0Ap1Ep9BpdAadRefQeXQBXUSX0GV0BV1F19B1tBneQDfRLXQb3UF3UVrQHt5D99ED9BA9Ql++PEZP0FP0DD1HL9BLlBG9Qr2Ag16jN+gt+g29Q7+j9yjJ/0jp/L9GH9BH9Al9Rl8QwBAjjDHBFDPcCnAssMQKa2ywBSfACXEinBgnwUlxMpwcp8ApcSqcGqfBaXE6nB5nwBlxJpwZZ8FZcTacHefAObEH9sS5cG6cB+fF+fAymB97YSv2xj7Yhn2xH/bHATgQF8AFcSFcGBfBRXExXByXwJlhSVwKl8ZlcFlcDpfHFXBFXAlXxlVwVVwNV8c1cE1cC9fGdXBdXA/Xxw1wQ9wIN8ZNsB03xUE4GIfgCBABmuFQ3BzvAC1wSxyGW+HNsDUOx21wBI7EbXE7HIWjcQyOxe1xB9wRd8KdcRfcFWcH3XB33APXQz1xL9wb98F9cT/8C+6Pf8UD8EA8CA/GQ/BQPAwPxyPwSDwKj8Zj8Bg8Fsf1IMVhTzwOj8PjsaOHnoAn4PZgInaMPZPwZDwFv0Pv0FQ8DU/HM/D/du3/z9JMPAvPxnPwXPwSzsPz8QK8EC/Ci/ESvBQvw8vxCrwSr8Kr8Rq8Fq/D6/EGvBFvwpvxFrwVb8Pb8Q68E+/Cu/EevBfvw/vxAXwQH8KH8RF8BB/Fx3ALdByfwCfxKXwan8Fn8Tl8Hl/AF/ElfBlfwVfxNXwd38A38S18G9/Bd/E9fB8/wO/gQ/wIP8ZP8FP8DD/HL/BL/Aq/xm/wW/wbfod/x+/xB/wRf8Kf8RcMCCSIYEIIJYxwIogkimhiiIUkIAlJIpKYJCFJSTKSnCQnKUhKkoqkJmlIKZyWpCPpSQaSkWQimUkWkpVkI9lJDpKTeBBPkovkJnlIXpKP5CdexEq8iQ+xEV/iR/xJAAkkBcgpUJAUIoVJEVKUFCPFSUVYgpQkpUhpUoaUJeXICFCeVCAVSSVSmVQhVUk1Up3UIDVJLVKb1CF1ST1SnzQgDUkj0pg0IXbSlASRYBJCmpFQ0py0IC1JGGlFWpNw0oZkBxEkkrQl7UgUSY6iSQyJJe1JB9KRdCKdSRfSlXQj3UkP0pP0Ir1JH9KX9CO/kP7kVzKADCSDyGAyhAzGg/FQ8uXLly/DyHAygowko8hoMoaMJePIeDKBTCSTyGQyhUwl08h0MoPMJLPIbDKbzHHSXBLXisbg4nAemUfG4/nkNpwKF5A7zvBC4mhJ9dAi8hKNx4tJHNoTO/CJeAlxzCyWkmVkOVlBVpKVZBVZRVaTNWQtWUfWkw1kI9lENpPNZAvZSraR7WQH2Ul2kd1kD9lL9pH95AA5SA6Rw+R/u838pP+/6Qg5So6R4+QEOUlOkdPkDDlLXsJz5Dy5QC6SS+QyuUKukmvkOrlBbpJb5Da5Q+6Se+Q+eUAekIfkEXlMnpCn5Bl5Tl6Ql+QVeU3ekLfkN/KO/E7ekw/kI/lEPpMvBFBIEcWUUEoZ5VRQSRXV1FALTUAT0kQ0MU1Ck9JkNDlNQVPSVDQ1TRP/Py1NR9PTDLQLzEhbIAdloplpFnoVZKXZaHaag+akHtST5qK5aR6al+aj+akXtVJv6kNt1Jf6UX8aQANpAVqQFqKFaRFalBajxWkJWpKWoqVpGVqWlqPlaQVakVailWkVWpVWo9VpDVqT1qK1aR1al9aj9WkD2pA2oo1pE2qnJWBTOhgE0WAaDEJoMxpKm9MWtCUNo61oaxpO29AIuphE0ra0HY2i0TSGxtL2tAPtSDvRzrQL7Uq70e60B+1Je9HetA/tS/vRX2h/+isdQAfQgXQQHUyH0KF0GB1OR9CRdBQdTcfQsXQcHU8n0Il0Ep1Mp9CpdBqdTmfQmXQWnU3n0Ll0Hp1PF9CFdBFdTJfQpXQZXU5X0JV0FV1N19C1dB1dTzfQjXQT3Uy30K10G91Od9CddBfdTffQvXQf3U8P0IP0ED1Mj9Cj9Bg9Tk/Qk/QUPU3P0LP0HD1PL9CL9BK9TK/Qq/QavU5v0Jv0Fr1N79C79B69R+/TB/QhfUQf0yf0KX1Gn9MX9CV9RV/TN/Qt/Y2+o7/T99Qx2/5AP9JP9DNNSb5QwCBDDDPCKGOMM8EkU0wzwywsAUtFHJSQJWKJWRKWlCVjyVkKlpKlZKlYKpaapWZpWBqWlqVl6Vg6lp6lZxlYBpaRZWSZWCaWmWVmWVgWlpVlY9lZDpaTeTBPlovlZnlYXpaP5WdezMq8mQ+zMV/mx/xZAAtkBVhBVogVZkVYUVaMFWclWElWipVmZVhZVo6VZxVYRVaJVWZVWFVWjVVnNVhNVovVZnVYXVaP1WcNWEPWiDVmTZidNWVBLJiFsGYslDVnLVhLFsZasdbMMfKGszYsgkWytqwdi2JFUTSLYbGsPevAOrJOrDPrwrqyxrgb6856sJ6sF+vN+rC+rB/7hfVnv7IBbCAbxAazIWwoC8JfaTQa7VyPjgDlyGjkuEaAzXAzdCDD2HA2go1ko9hoNoaNZePYeDaBTWST2GQ2hU1l09h0NoM55rR34Ew2i81mc9hcNo/NZwvYQraILWZL2FK2jC1nYXgFW8lWsdVsDVvL1rH1bAPbyDaxCLCZbWFb2Ta2jW1nO9hOtovtZntYObSX7WP7WUl0gB1gicFBdogdZkdYYXCUHWPH2Ql2kp1ip9kZdpadY+fZBXaRXWKX2RV2lV1j19kNdpPdYrfZHXaX3WP32QP2gDlG6D9Gb0eMYw/pIfMEj9hj9oQ9Zc/Yc/aCvWQdyCv2mkWAN+wt+429Y7+z9+wD+8g+sc/sCwMccsQxJ5xyxjkXXHLFNTfcwhPwhDwRT8yT8KQ8GU/OU/DBOCVPxVNzxwwkDU/L0/H0PAPPyDPxzDwLz8qz8ew8B8/JPbgnz8WnkqmkC8jNB9A8PC/Px/Px/Dw/9+Je3Mqt3Jt7cx9u477cj/vzAB7I/7fHhZ/0k37ST/pJP+kn/aSf9JN+0k/6ST9SAV6QF+KFeRFelBfjxXkJXoKX5KV4aV6Gl+FleTlejpfnFXgFXpFX4pV4ZV6FV+FV+RVSjVfnNXhNfp3U4rV5HV6X1+P1eQPekDfijXkTbudNeRAP5iG8GQ/lzXkL3pKH8Va8NQ/nbXgEj+RteTsexaN5DI/l7XkH3pF34p15F96Vd+PdeQ/ek/fivXkf3pf347/w/k76lQ/gA/lAPogP4oP5YD6ED+XD+HA+gqelI/koPpqP4WP5OD6eT+AT+SQ+mU/hU/k0Pp3P4DP5LD6bz+F56Fw+j8/nC/hCvogv4ov5Er6EL+XL+DK+nK/gK/kqvoqv5mv4Wr6Wr+Pr+Qa+kW/im/kWvpVv49v5Dr6T7+K7+R6+l+/j+/kBfpAf4of5EX6UH+PH+Ql+kp/ip/kZfpaf4+f5BX6RX+KX+RV+lV/j1/kNfpPf4rf5HX6X3+P3+QP+kD/ij/kT/pQ/48/5C/6Sv+Kv+Rv+lv/G3/Hf+Xv+nn/gH/lHXp9GgU/8M//MG9Ev/AsHAgoksCCCCia4cPxJoYQWWhhhEQlEApFQJBKJRWKRRCQVyUQykVykEClESpFKpBZpRFqRTqQXGUQGkVFkEplFZpFFZBVZRTaRXeQQOURO4SE8hafIJXKLPCKPyCvyifyiAPASVuEtfIRN+Ao/4S8CRKAoIAqKQqKwKCKKimKiuCghSopSorQoI8qKcqK8qCAqikqisqgiqopqorqoIWqKWqK2qCPqinqivmggGopGorFoIuyiqQgSwSJENBOhorloIVqKMNFKtBbhoo2IEJGirWgnokS0iBGxor3oIDqKTqKz6CK6im6iu+gheopeorfoI/qKfuIX0V/8KgaIgWKQGCyGiKFimBguRoiRYpQYLcaIsWKcGC8miIlikpgspoipYpqYLmaImWKWmC3miLlinpgvFoiFYpFYLJaIpWKZWC5WiJVilVgt1oi1Yp1YLzaIjWKT2Cy2iK1im9gudoidYpfYLfaIvWKf2C8OiIPikDgsjoij4pg4Lk6Ik+KUOC3OiLPinDgvLoiL4pK4LK6Iq+KauC5uiJvilrgt7oi74p64Lx6Ih+KReCyeiKfimXguXoiX4pV4Ld6It+I38U78Lt6LD+Kj+CQ+iy8CSCiRxJJIKpnkUkgpldTSSItMIBPKRDKxTCKTymQyuUwhU8pUMrVMI9PKdDK9zCAzykwys8wis8psMrvMIXNKD+kpc8ncMo/MK/PJ/NJLWqW39JE26Sv9pL8MkIGygCwoC8nCsogsKovJ4rKELClLydKyjCwry8nysoKsKCvJyrKKrCqryeqyhqwpa8naso6sK+vJ+rKBbCgbycayibTLpjJIBssQ2UyGyuayhWwpw2Qr2VqGyzYyQkbKtrKdjJLRMkbGyvayg+woO8nOsovsKrvJ7rKH7Cl7yd6yj+wr+8lfZH/5qxwgB8pBcrAcIofKYXK4HCFHylFytBwjx8pxcrycICfKSXKynCKnymlyupwhZ8pZcracI+fKeXK+XCAXykVysVwil8plcrlcIVfKVXK1XCPXynVyvdwgN8pNcrPcIrfKbXK73CF3yl1yt9wj98p9cr88IA/KQ/KwPCKPymPyuBxJT8iT8pQ8Lc/Is/KcPC8vyIvykrwsr8ir8pq8Lm/Im/KWvC3vyLvynrwvH8h86KF8JB/Lx+CJfCKfymfyuZxMX8iX8pV8Ld/It/I3+U7+Lt/LD/Kj/CQ/yy8SKKCgk5BCCiuiqGKKK6GkkiruTyutjLKoBCqhSqQSqyQqqUqqFtPFNJlKppKrFCqlSqVSqzQqrUqn0qsMKqPKpDKrLCqryqayqexOyqFyqJzKQ3mqXCq3yqPyqnwqv/JSVuWtfJRN+So/tYT6qwAVqJbTAqqgKqQKqyKqqCqmiqsSqqQqpUqrMqqsKqfKqwqqoqqoKqlKqrKqoqqqamotra6qqxqqhqqpaqkNtLaqo+qqeqq+aqAaqkaqsWqi7KqpClJXabAKUc1UMxWqmqsWqqUKU61UaxWu2qgIFanaKsdOfzsVpaJVjIpV7VUH1VF1Up1VF9VVdVPdVQ/VQ/VUvVRv1UcdB31VP/WL6h9Pv6oBaqAapAarIWqoGqaGqeFqhBqpRqnRaowaq8apcWq8mqAmqklqspqipqipapqarmaomWqWmq1mqzlqrpqn5qsFaqFapBarsWCJWqqWqmVquVqhVqqVapVardaoNWqtWqfWqw1qg9qoNqnNarPaoraqbWqb2q52qJ1ql9qtdqs9aq/aq/ap/eqAOqAOqkPqsDqsjqij6pg6po6r4+oVPaFOqlPqtDqjzqpz6ry6oC6qS+qSuqyuqKvqmrqurqsb6qa6pW6p2+qOuqvuqfvqgXqgHqpH6rF6op6qp+qZeq5eqBfqpXqlPtLX6o16q35T79Q79bt6rz7RD+qj+qQ+qy8KaKihRhproommmmmmuRZaaqW1NtqiLTqBTkkS6kQ6kU6sk+ikOplOrlPolDqVTq3T6LQ6nU6vM+iMOpPOrLPorDqbzq5z6JzaQ3vqXDq39mB5dF6dT+fXXtqqMxJv7aNt2lf7aX8doAN1AV1QF9KFdRFdVBfTxXUJXVKX0qV1GV1Wl9PldQVdUVfSlXUVXVVX09V1DV1T19K1dR1dV9fT9eOpgW6oG+nGuonOxe26qQ7SntyTB+sQ3UyH6ua6hW6pw3Qr3VqH6zY6QkfqtrqdjtLROkbH6va6g+6oO+nOugDporvqbrq77qF76l66t+6j++p++hfdX/+qB+iBepAerIfooXqYHq5H6JF6lB6tx+ixepweryfoiXqSnqyn6Kl6mp6uZ+iZepaerefouXqenq8X6IV6kV6sl+ileplerlfolXqVXq3X6LV6nV6vN+iNzmuT3uy8tuitzmub3u68duid365derfeo/c6r316v/M6oA/qQ/qwPqKP6mP6uD6hT+pT+rQ+o8/qc/q8vqAv6kv6sr6ir+pr+rq+oW/qW/q2vqPv6nv6vn6gH+pH+rF+op/qZ/q5fqFf6ld6NHqtg/AbvRl+/fbnzz8Q99++/3SnrySKu6PkCJVA34cdUiOA497TV92O0B/pfJX6TyTum+M+yVv9m36nf9fv9Xv9QX/Un/Rn/Vl/0cBAM44hg814Rgw1zExg3AgjjTITmTbGWEwCk9AkMolNEpPUJDPJTQqT0qQyqU0ak9akM+lNBpPRZDKZTRaT1WQz2U0Ok9N4GE+Ty+Q2eUxek8/kN17GaryNt/ExNuNr/Iy/CTCBpoApaAqZwqaIKWqKmeKmhClpSpnSpowpa8qZ8qaCqWgqmcqmiqlqqpnqpoapaWqZ2qaOqWvqmfqmgWloGpnGpomxm6YmyASbkHhqZkJNc9PCtDRhppVpbcJNGxNhIk1b085EmWjTG8eYDiTWtDcdTEfTyXQ2XUxX0810N91ND9PT9DK9TW/Tx/Q1fU0/84vpb341A8xAM8gMNkPMUDPMDDcjzEgzyow2Y8xYM86MNxPMRDPJTDZTzFQzzUw3M8xMM8vMNnPMXDPPzDcLzEKzyCw2S8xSs8wsNyvMSrPKrDZrzFqzzqw3G8xGs8lsNlvMVrPNbDc7zE6zy+w2e8xes8/sNwfMQXPIHDZHzFFzzBw3J8xJc8qcNmfMWXPOnDcXzEVzyVw2V8xVc81cNzfMTXPL3DZ3zF1zz9w3D8xD88g8Nk/MU/PMPDcvzEvzyrw2b8xb85t5Z343780H89F8Mp/NFwMs0IIs2EIs1MIs3CIs0qIs2mIsFksCS0JLIktiSxJLUksyS3JLCktKSypLaksaS1pLOkt6SwZLRksmS2ZLFktWSzZLdksOS06Lh8XTksuS25LHkteSz5Lf4mWxWrwtPhabxdfiZ/G3BFgCLQUsBS2FLIUtRSxFLcUsxS0lLCUtX/72r5SllKW0pYzlvwAYnImV2PoBAA==",
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
