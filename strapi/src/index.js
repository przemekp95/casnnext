'use strict';

const PUBLIC_PERMISSIONS = [
  'api::author.author.find',
  'api::author.author.findOne',
  'api::analysis.analysis.find',
  'api::analysis.analysis.findOne',
  'api::issue-collection.issue-collection.find',
  'api::issue-collection.issue-collection.findOne',
];

async function ensurePublicPermissions(strapi) {
  const roleService = strapi.plugin('users-permissions')?.service('role');
  if (!roleService) return;

  const roles = await roleService.find();
  const publicRole = roles.find((role) => role.type === 'public');
  if (!publicRole) return;

  // Best effort: Strapi's internals can vary slightly between releases
  for (const action of PUBLIC_PERMISSIONS) {
    try {
      await strapi
        .query('plugin::users-permissions.permission')
        .updateMany({
          where: { role: publicRole.id, action },
          data: { enabled: true },
        });

      const existing = await strapi
        .query('plugin::users-permissions.permission')
        .findOne({ where: { role: publicRole.id, action } });

      if (!existing) {
        await strapi.query('plugin::users-permissions.permission').create({
          data: {
            role: publicRole.id,
            action,
            enabled: true,
          },
        });
      }
    } catch (error) {
      strapi.log.warn(`Unable to set public permission ${action}: ${error.message}`);
    }
  }
}

module.exports = {
  async bootstrap({ strapi }) {
    await ensurePublicPermissions(strapi);
  },
};
