// Definitions every receiving target shares (accepted T15 semantic contracts, copied as data; tests verify against the actual sources).
export const CORE_ASPECTS = [
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
  }
];
export const CORE_PROFILES = [
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
];
