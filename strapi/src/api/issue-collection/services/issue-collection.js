'use strict';

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::issue-collection.issue-collection');
