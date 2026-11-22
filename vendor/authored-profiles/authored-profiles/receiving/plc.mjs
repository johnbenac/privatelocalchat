// What Private Local Chat consumes beyond the shared core: the dossier. Data only; nothing here names another project.
export const PLC_ASPECTS = [
  {
    "id": "core:dossier",
    "version": "0",
    "label": "Dossier",
    "definition": "The authored generative pattern of a character, not lived memory.",
    "schema": {
      "type": "object",
      "properties": {
        "motive": {
          "type": "string",
          "minLength": 1,
          "pattern": "\\S"
        },
        "contradiction": {
          "type": "string",
          "minLength": 1,
          "pattern": "\\S"
        },
        "actsOnOthers": {
          "type": "string",
          "minLength": 1,
          "pattern": "\\S"
        },
        "traits": {
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1,
            "pattern": "\\S"
          }
        },
        "backstory": {
          "type": "string",
          "minLength": 1,
          "pattern": "\\S"
        },
        "authorBackstory": {
          "type": "string",
          "minLength": 1,
          "pattern": "\\S"
        }
      },
      "required": [],
      "additionalProperties": false
    },
    "scopes": [
      "subject",
      "context",
      "instance"
    ],
    "links": [],
    "privatePaths": [
      "/authorBackstory"
    ]
  }
];
export const PLC_CONSUMED = ['core:identity', 'core:dossier', 'core:communication'];
