import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "**/.next/**",
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "packages/db/src/generated/**"
    ]
  },
  ...tseslint.configs.recommended
];
