sap.ui.define([
    "sap/ui/test/opaQunit",
    "./pages/JourneyRunner"
], function (opaTest, runner) {
    "use strict";

    function journey() {
        QUnit.module("First journey");

        opaTest("Start application", function (Given, When, Then) {
            Given.iStartMyApp();

            Then.onTheConfigCatalogList.iSeeThisPage();
            Then.onTheConfigCatalogList.onFilterBar().iCheckFilterField("Module");
            Then.onTheConfigCatalogList.onFilterBar().iCheckFilterField("Configuration Type");
            Then.onTheConfigCatalogList.onTable().iCheckColumns(5, {"ModuleId":{"header":"Module"},"ConfName":{"header":"Configuration Name"},"ConfType":{"header":"Configuration Type"},"TargetCds":{"header":"Target CDS"},"CreatedAt":{"header":"Created At"}});

        });


        opaTest("Navigate to ObjectPage", function (Given, When, Then) {
            // Note: this test will fail if the ListReport page doesn't show any data
            
            When.onTheConfigCatalogList.onFilterBar().iExecuteSearch();
            
            Then.onTheConfigCatalogList.onTable().iCheckRows();

            When.onTheConfigCatalogList.onTable().iPressRow(0);
            Then.onTheConfigCatalogObjectPage.iSeeThisPage();

        });

        opaTest("Teardown", function (Given, When, Then) { 
            // Cleanup
            Given.iTearDownMyApp();
        });
    }

    runner.run([journey]);
});