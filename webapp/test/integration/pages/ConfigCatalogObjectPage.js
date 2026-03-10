sap.ui.define(['sap/fe/test/ObjectPage'], function(ObjectPage) {
    'use strict';

    var CustomPageDefinitions = {
        actions: {},
        assertions: {}
    };

    return new ObjectPage(
        {
            appId: 'zgsp26.conf.mng.confmngcatalog',
            componentId: 'ConfigCatalogObjectPage',
            contextPath: '/ConfigCatalog'
        },
        CustomPageDefinitions
    );
});