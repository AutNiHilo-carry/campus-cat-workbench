icons.monthly='<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4m8-4v4M3 10h18m-13 6 3 3 5-6"/>';
icons.finance='<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18m-5 5h5M7 2l10 3"/>';
icons.history='<path d="M3 11a9 9 0 1 1 2 7M3 5v6h6m3-4v6l4 2"/>';
const checklistItems={health:'健康与用药记录',medicine:'药品及使用说明',food:'猫粮与喂养说明',supplies:'航空箱、猫砂等用品',contact:'照护联系人与交接确认'};
const completedStates={rescue:'已结案',foster:'已结束',adoption:'已领养',sterilization:'已完成'};
const recordTypes=['announcements','events','sponsors','rescue','foster','adoption','sterilization','inventory','monthly','finance','cats'];
const businessTypes=['rescue','foster','adoption','sterilization'];
const extraInventory=[
 {id:'C001',name:'校园猫咪贴纸',group:'文创',category:'贴纸',variant:'六猫组合款',qty:70,reserved:10,sold:10,unit:'张',place:'活动室文创柜',unitPriceCents:600,kind:'消耗品'},
 {id:'C002',name:'喵邻帆布袋',group:'文创',category:'帆布袋',variant:'原色 / 橘猫款',qty:18,reserved:5,sold:0,unit:'个',place:'活动室文创柜',unitPriceCents:2500,kind:'消耗品'},
 {id:'C003',name:'猫咪徽章',group:'文创',category:'徽章',variant:'小芝麻款',qty:6,reserved:0,sold:0,unit:'枚',place:'活动室文创柜',unitPriceCents:800,kind:'消耗品'}
];
initial.monthly=[
 {id:'W001',title:'小芝麻救助与安置交接完成',category:'救助管理',cat:'小芝麻',owner:'陈同学',date:'2026-10-20',result:'完成现场接送及安置交接，寄养后续独立跟进。',sourceType:'rescue',sourceId:'R002'},
 {id:'W002',title:'煤球寄养交接完成',category:'寄养管理',cat:'煤球',owner:'许同学',date:'2026-10-20',result:'已向试养家庭交接健康记录和用品，领养组继续回访。',sourceType:'foster',sourceId:'F003'}
];
initial.finance=[
 {id:'B001',title:'协会活动筹款（示例）',flow:'收入',amountCents:180000,owner:'林同学',date:'2026-10-05',status:'已入账',paidDate:'2026-10-05',linkType:'',linkId:'',receipt:'筹款登记表（示例）',note:'示例期初为零，记录本月筹款。'},
 {id:'B002',title:'橘子门诊检查（示例）',flow:'协会支出',amountCents:38000,owner:'林同学',date:'2026-10-21',status:'已入账',paidDate:'2026-10-21',linkType:'rescue',linkId:'R001',receipt:'门诊票据 001（示例）',note:'检查及治疗费用。'},
 {id:'B003',title:'三花绝育垫付（示例）',flow:'个人垫付',amountCents:26000,owner:'王同学',date:'2026-10-19',status:'待报销',paidDate:'',linkType:'sterilization',linkId:'S002',receipt:'绝育票据 002（示例）',note:'费用已发生，协会尚未向成员报销。'},
 {id:'B004',title:'日常猫粮采购（示例）',flow:'协会支出',amountCents:32000,owner:'王同学',date:'2026-10-18',status:'已入账',paidDate:'2026-10-18',linkType:'inventory',linkId:'I001',receipt:'采购票据 003（示例）',note:'一笔采购记账；物资数量在物资模块登记。'},
 {id:'B005',title:'校园猫咪贴纸销售（示例）',flow:'收入',amountCents:6000,owner:'陈同学',date:'2026-10-20',status:'已入账',paidDate:'2026-10-20',linkType:'inventory',linkId:'C001',receipt:'义卖登记表（示例）',note:'10 张 × 6 元。',movementId:'M-SEED'}
];
initial.movements=[{id:'M-SEED',itemId:'C001',itemName:'校园猫咪贴纸',type:'售出',quantity:10,date:'2026-10-20',owner:'陈同学',destination:'校园义卖',cat:'公共事项',amountCents:6000,financeId:'B005',note:'示例销售收入已关联财务。'}];
initial.loans=[];
initial.audit=[];
initial.inventory.push(...structuredClone(extraInventory));
function migrateData(input){return DanmiaoDomain.legacyMigrate(input,{defaults:initial,extraInventory});}
