sap.ui.define(["sap/m/MessageToast"], function (MessageToast) {
  "use strict";

  return {
    onMaintainPress: function () {
      try {
        const oView = this.base.getView();
        const oContext = oView.getBindingContext();

        if (!oContext) {
          MessageToast.show("No object context found");
          return;
        }

        const oData = oContext.getObject();

        console.log("Maintain pressed");
        console.log("Current catalog object:", oData);

        MessageToast.show(
          "Maintain clicked for: " +
            (oData.ConfigName || oData.TargetCds || "current config"),
        );
      } catch (e) {
        console.error("Maintain action error:", e);
        MessageToast.show("Cannot run Maintain action");
      }
    },
  };
});
