// Runtime data snapshot; tests require exact equality with definitions.v1.json.
export const DEFINITIONS = {
  "format": "cosmogenitor/content-registry/0",
  "aspectDefinitions": [
    {
      "id": "authored:identity-v1",
      "version": "1.0.0",
      "label": "Identity",
      "definition": "Authored design attribution; conveys no individual or authority.",
      "scopes": [
        "subject",
        "context"
      ],
      "schema": {
        "type": "object",
        "properties": {
          "version": {
            "const": "1.0.0"
          },
          "designId": {
            "type": "string",
            "minLength": 1,
            "maxLength": 128
          },
          "revision": {
            "type": "string",
            "minLength": 1,
            "maxLength": 128
          },
          "author": {
            "type": "string",
            "minLength": 1,
            "maxLength": 8192
          },
          "standing": {
            "enum": [
              "authored"
            ]
          },
          "privateNote": {
            "type": "string",
            "minLength": 1,
            "maxLength": 8192
          }
        },
        "required": [
          "version"
        ],
        "additionalProperties": false
      },
      "links": [],
      "localReferences": [],
      "privatePaths": [
        "/privateNote"
      ]
    },
    {
      "id": "authored:lore-v1",
      "version": "1.0.0",
      "label": "Lore",
      "definition": "Bounded authored context selection; not lived knowledge.",
      "scopes": [
        "subject",
        "context"
      ],
      "schema": {
        "type": "object",
        "properties": {
          "version": {
            "const": "1.0.0"
          },
          "budgetChars": {
            "type": "integer",
            "minimum": 0,
            "maximum": 4096
          },
          "entries": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128
                },
                "text": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 8192
                },
                "tags": {
                  "type": "array",
                  "items": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 128
                  },
                  "maxItems": 128
                },
                "contexts": {
                  "type": "array",
                  "items": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 128
                  },
                  "maxItems": 128
                },
                "eligibleInputs": {
                  "type": "array",
                  "items": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 128
                  },
                  "maxItems": 128
                },
                "priority": {
                  "type": "integer",
                  "minimum": 0,
                  "maximum": 100
                },
                "insertion": {
                  "enum": [
                    "before-guidance",
                    "after-guidance"
                  ]
                },
                "audience": {
                  "type": "array",
                  "items": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 128
                  },
                  "maxItems": 128
                }
              },
              "required": [
                "id",
                "text",
                "audience"
              ],
              "additionalProperties": false
            },
            "maxItems": 128
          },
          "privateNote": {
            "type": "string",
            "maxLength": 8192
          }
        },
        "required": [
          "version"
        ],
        "additionalProperties": false
      },
      "links": [
        {
          "path": "/entries/*/contexts/*",
          "collection": "contexts"
        }
      ],
      "localReferences": [
        {
          "ids": "/entries/*/id",
          "references": []
        }
      ],
      "privatePaths": [
        "/privateNote"
      ]
    },
    {
      "id": "authored:guidance-v1",
      "version": "1.0.0",
      "label": "Guidance",
      "definition": "Model-independent instructions and labelled illustrative exchanges.",
      "scopes": [
        "subject",
        "context"
      ],
      "schema": {
        "type": "object",
        "properties": {
          "version": {
            "const": "1.0.0"
          },
          "instructions": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1,
              "maxLength": 8192
            },
            "maxItems": 128
          },
          "examples": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "input": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 8192
                },
                "output": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 8192
                },
                "standing": {
                  "const": "authored-example"
                }
              },
              "required": [
                "input",
                "output",
                "standing"
              ],
              "additionalProperties": false
            },
            "maxItems": 128
          },
          "adapter": {
            "enum": [
              "plain-text-v1",
              "role-messages-v1"
            ]
          },
          "privateNote": {
            "type": "string",
            "minLength": 1,
            "maxLength": 8192
          }
        },
        "required": [
          "version"
        ],
        "additionalProperties": false
      },
      "links": [],
      "localReferences": [],
      "privatePaths": [
        "/privateNote"
      ]
    },
    {
      "id": "authored:prepared-v1",
      "version": "1.0.0",
      "label": "Prepared",
      "definition": "Offered finite interaction material; no app actions or resident commands.",
      "scopes": [
        "subject",
        "context"
      ],
      "schema": {
        "type": "object",
        "properties": {
          "version": {
            "const": "1.0.0"
          },
          "variables": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "key": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128
                },
                "values": {
                  "type": "array",
                  "items": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 8192
                  },
                  "maxItems": 128
                }
              },
              "required": [
                "key",
                "values"
              ],
              "additionalProperties": false
            },
            "maxItems": 128
          },
          "initial": {
            "type": "string",
            "minLength": 1,
            "maxLength": 128
          },
          "states": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128
                },
                "inputs": {
                  "type": "array",
                  "items": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 128
                  },
                  "maxItems": 128
                },
                "when": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "key": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 128
                      },
                      "equals": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 8192
                      }
                    },
                    "required": [
                      "key",
                      "equals"
                    ],
                    "additionalProperties": false
                  },
                  "maxItems": 128
                },
                "variants": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "id": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 128
                      },
                      "text": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 8192
                      },
                      "assets": {
                        "type": "array",
                        "items": {
                          "type": "string",
                          "minLength": 1,
                          "maxLength": 128
                        },
                        "maxItems": 128
                      },
                      "next": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 128
                      }
                    },
                    "required": [
                      "id",
                      "text"
                    ],
                    "additionalProperties": false
                  },
                  "maxItems": 128
                },
                "generativeExit": {
                  "type": "boolean"
                }
              },
              "required": [
                "id"
              ],
              "additionalProperties": false
            },
            "maxItems": 128
          }
        },
        "required": [
          "version"
        ],
        "additionalProperties": false
      },
      "links": [
        {
          "path": "/states/*/variants/*/assets/*",
          "collection": "assets"
        }
      ],
      "localReferences": [
        {
          "ids": "/states/*/id",
          "references": [
            "/initial",
            "/states/*/variants/*/next"
          ]
        }
      ],
      "privatePaths": []
    },
    {
      "id": "authored:presentation-v1",
      "version": "1.0.0",
      "label": "Presentation",
      "definition": "Data-only app-owned presentation vocabulary.",
      "scopes": [
        "subject",
        "context"
      ],
      "schema": {
        "type": "object",
        "properties": {
          "version": {
            "const": "1.0.0"
          },
          "layout": {
            "enum": [
              "dialogue",
              "folio"
            ]
          },
          "palette": {
            "enum": [
              "dusk",
              "paper",
              "sea"
            ]
          },
          "reducedMotion": {
            "const": true
          },
          "alt": {
            "type": "string",
            "minLength": 1,
            "maxLength": 8192
          },
          "assets": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1,
              "maxLength": 128
            },
            "maxItems": 128
          }
        },
        "required": [
          "version"
        ],
        "additionalProperties": false
      },
      "links": [
        {
          "path": "/assets/*",
          "collection": "assets"
        }
      ],
      "localReferences": [],
      "privatePaths": []
    },
    {
      "id": "authored:media-v1",
      "version": "1.0.0",
      "label": "Media",
      "definition": "Explicit resource requirements and licensed alternatives.",
      "scopes": [
        "subject",
        "context"
      ],
      "schema": {
        "type": "object",
        "properties": {
          "version": {
            "const": "1.0.0"
          },
          "resources": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "asset": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128
                },
                "required": {
                  "type": "boolean"
                },
                "purpose": {
                  "enum": [
                    "illustration",
                    "background",
                    "prepared-audio",
                    "document"
                  ]
                },
                "alt": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 8192
                },
                "author": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 8192
                },
                "license": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 8192,
                  "pattern": "\\S"
                }
              },
              "required": [
                "asset",
                "required",
                "purpose",
                "alt",
                "author",
                "license"
              ],
              "additionalProperties": false
            },
            "maxItems": 128
          }
        },
        "required": [
          "version"
        ],
        "additionalProperties": false
      },
      "links": [
        {
          "path": "/resources/*/asset",
          "collection": "assets"
        }
      ],
      "localReferences": [],
      "privatePaths": []
    },
    {
      "id": "authored:evidence-v1",
      "version": "1.0.0",
      "label": "Evidence",
      "definition": "Explicitly attributed seeds and reports; no firsthand authority.",
      "scopes": [
        "subject",
        "context"
      ],
      "schema": {
        "type": "object",
        "properties": {
          "version": {
            "const": "1.0.0"
          },
          "entries": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128
                },
                "standing": {
                  "enum": [
                    "authored-seed",
                    "reported",
                    "synthetic-report",
                    "derived"
                  ]
                },
                "text": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 8192
                },
                "author": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 8192
                },
                "design": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128
                },
                "individual": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128
                },
                "run": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128
                },
                "participant": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128
                },
                "source": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128
                },
                "occurrence": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128
                },
                "audience": {
                  "type": "array",
                  "items": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 128
                  },
                  "maxItems": 128
                },
                "derivedFrom": {
                  "type": "array",
                  "items": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 128
                  },
                  "maxItems": 128
                }
              },
              "required": [
                "id",
                "standing",
                "text",
                "author",
                "design",
                "audience"
              ],
              "additionalProperties": false
            },
            "maxItems": 128
          },
          "privateNote": {
            "type": "string",
            "maxLength": 8192
          }
        },
        "required": [
          "version"
        ],
        "additionalProperties": false
      },
      "links": [
        {
          "path": "/entries/*/design",
          "collection": "subjects"
        }
      ],
      "localReferences": [
        {
          "ids": "/entries/*/id",
          "references": [
            "/entries/*/derivedFrom/*"
          ]
        }
      ],
      "privatePaths": [
        "/privateNote"
      ]
    }
  ],
  "profiles": [
    {
      "id": "authored:character-v1",
      "version": "1.0.0",
      "label": "Rich authored character",
      "definition": "Optional composable authored character resources; no complete dossier required.",
      "extends": [
        "profile:character"
      ],
      "aspects": [
        "authored:identity-v1",
        "authored:lore-v1",
        "authored:guidance-v1",
        "authored:prepared-v1",
        "authored:presentation-v1",
        "authored:media-v1",
        "authored:evidence-v1"
      ]
    }
  ]
};
