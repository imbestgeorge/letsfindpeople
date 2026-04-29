/* global process */

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const pagesBase = process.env.GITHUB_ACTIONS && repositoryName
  ? `/${repositoryName}/`
  : "/";

export default {
  base: process.env.VITE_BASE_PATH || pagesBase,
};
