package handler

import (
	"strings"
	"unicode"
)

// toSnakeCase converts a camelCase JSON key to snake_case DB column name.
// e.g. "isActive" -> "is_active", "targetUrl" -> "target_url".
// Keys already in snake_case pass through unchanged.
func toSnakeCase(s string) string {
	var b strings.Builder
	for i, r := range s {
		if unicode.IsUpper(r) {
			if i > 0 {
				b.WriteByte('_')
			}
			b.WriteRune(unicode.ToLower(r))
		} else {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// snakeKeys converts all keys of a JSON-bound map to snake_case so GORM
// Updates() maps them to the correct Postgres columns. Without this,
// camelCase keys like "isActive" are quoted literally and the UPDATE
// silently touches a non-existent column.
func snakeKeys(m map[string]interface{}) map[string]interface{} {
	out := make(map[string]interface{}, len(m))
	for k, v := range m {
		out[toSnakeCase(k)] = v
	}
	return out
}
