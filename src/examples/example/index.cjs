'use strict';
exports.activate=api=>{
  api.registerAction('hello','Hello from MasterHUB',()=>api.notify('Your custom MasterHUB add-on is working.'));
  api.registerAction('counter','Persistent counter',()=>{
    const settings=api.getSettings();settings.count=(Number(settings.count)||0)+1;
    api.setSettings(settings);api.notify(`Button pressed ${settings.count} times.`);
  });
};
