sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"zgsp26/conf/mng/confmngcatalog/test/integration/pages/ConfigCatalogList",
	"zgsp26/conf/mng/confmngcatalog/test/integration/pages/ConfigCatalogObjectPage",
	"zgsp26/conf/mng/confmngcatalog/test/integration/pages/ConfigFieldDefObjectPage"
], function (JourneyRunner, ConfigCatalogList, ConfigCatalogObjectPage, ConfigFieldDefObjectPage) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('zgsp26/conf/mng/confmngcatalog') + '/test/flp.html#app-preview',
        pages: {
			onTheConfigCatalogList: ConfigCatalogList,
			onTheConfigCatalogObjectPage: ConfigCatalogObjectPage,
			onTheConfigFieldDefObjectPage: ConfigFieldDefObjectPage
        },
        async: true
    });

    return runner;
});

