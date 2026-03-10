sap.ui.define(['sap/fe/test/ListReport'], function(ListReport) {
    'use strict';

    var CustomPageDefinitions = {
        actions: {},
        assertions: {}
    };

    return new ListReport(
        {
            appId: 'zgsp26.conf.mng.confmngcatalog',
            componentId: 'ConfigCatalogList',
            contextPath: '/ConfigCatalog'
        },
        CustomPageDefinitions
    );
});