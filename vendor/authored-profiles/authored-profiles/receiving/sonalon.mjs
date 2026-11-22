// What the Sonalon design projection consumes beyond the shared core. Data only; kept out of the PLC entry on purpose.
export const SONALON_ASPECTS = [
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
];
export const SONALON_CONSUMED = ['core:identity', 'core:voice', 'core:communication', 'sonalon:design-metadata',
  'sonalon:authored-sections', 'sonalon:voice-sections', 'sonalon:start'];
