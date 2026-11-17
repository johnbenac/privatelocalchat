// Accepted T15 semantic contracts, copied as data; tests verify against the actual sources.
export const RECEIVING_DEFINITIONS = {
  "aspectDefinitions": [
    {
      "id": "core:identity",
      "version": "0",
      "label": "Identity",
      "definition": "Names, premise and identity commitments for an authored being.",
      "schema": {
        "type": "object",
        "properties": {
          "aliases": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1,
              "pattern": "\\S"
            }
          },
          "premise": {
            "type": "string",
            "minLength": 1,
            "pattern": "\\S"
          },
          "kindOfBeing": {
            "type": "string",
            "minLength": 1,
            "pattern": "\\S"
          },
          "commitments": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1,
              "pattern": "\\S"
            }
          },
          "freedoms": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1,
              "pattern": "\\S"
            }
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
      "links": []
    },
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
    },
    {
      "id": "core:communication",
      "version": "0",
      "label": "Communication",
      "definition": "How a character expresses themselves in words.",
      "schema": {
        "type": "object",
        "properties": {
          "manner": {
            "type": "string",
            "minLength": 1,
            "pattern": "\\S"
          },
          "signatureLine": {
            "type": "string",
            "minLength": 1,
            "pattern": "\\S"
          },
          "soundsLike": {
            "type": "string",
            "minLength": 1,
            "pattern": "\\S"
          },
          "neverSoundsLike": {
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
      "links": []
    },
    {
      "id": "core:voice",
      "version": "0",
      "label": "Voice identity",
      "definition": "Speaker description and selected references, separate from a delivery.",
      "schema": {
        "type": "object",
        "properties": {
          "description": {
            "type": "string",
            "minLength": 1,
            "pattern": "\\S"
          },
          "timbre": {
            "type": "string",
            "minLength": 1,
            "pattern": "\\S"
          },
          "accent": {
            "type": "string",
            "minLength": 1,
            "pattern": "\\S"
          },
          "pace": {
            "type": "string",
            "minLength": 1,
            "pattern": "\\S"
          },
          "neutralReference": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9.-]*:[A-Za-z0-9][A-Za-z0-9._/-]*$"
          },
          "repertoire": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "label": {
                  "type": "string",
                  "minLength": 1,
                  "pattern": "\\S"
                },
                "direction": {
                  "type": "string",
                  "minLength": 1,
                  "pattern": "\\S"
                },
                "reference": {
                  "type": "string",
                  "pattern": "^[a-z][a-z0-9.-]*:[A-Za-z0-9][A-Za-z0-9._/-]*$"
                }
              },
              "required": [
                "label"
              ],
              "additionalProperties": false
            }
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
      "links": [
        {
          "path": "/neutralReference",
          "collection": "references"
        },
        {
          "path": "/repertoire/*/reference",
          "collection": "references"
        }
      ]
    },
    {
      "id": "sonalon:design-metadata",
      "version": "0",
      "label": "design-metadata",
      "definition": "Explicit receiving design identifiers and adult identity fields.",
      "scopes": [
        "subject",
        "context"
      ],
      "schema": {
        "type": "object"
      }
    },
    {
      "id": "sonalon:authored-sections",
      "version": "0",
      "label": "authored-sections",
      "definition": "Explicit remaining Sonalon authored sections, not lived history.",
      "scopes": [
        "subject",
        "context"
      ],
      "schema": {
        "type": "object"
      }
    },
    {
      "id": "sonalon:voice-sections",
      "version": "0",
      "label": "voice-sections",
      "definition": "Explicit receiver speech samples and voice habits.",
      "scopes": [
        "subject",
        "context"
      ],
      "schema": {
        "type": "object"
      }
    },
    {
      "id": "sonalon:start",
      "version": "0",
      "label": "start",
      "definition": "Explicit authored initial state, projects and seeded memories.",
      "scopes": [
        "subject",
        "context"
      ],
      "schema": {
        "type": "object"
      }
    }
  ],
  "profiles": [
    {
      "id": "profile:character",
      "version": "0",
      "label": "Character",
      "definition": "An authored being; a name and line can be enough to start.",
      "aspects": [
        "core:identity",
        "core:dossier",
        "core:communication",
        "core:voice",
        "core:look"
      ],
      "extends": []
    }
  ]
};
