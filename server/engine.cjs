const path=require('node:path');
const domain=require('../shared-domain.js');
const root=path.resolve(__dirname,'..');
function engine(input){
 const state=domain.normalize(structuredClone(input??require('./demo-seed.json')));
 return {state,summary:month=>domain.finance(state,month)};
}
module.exports={engine,root};
