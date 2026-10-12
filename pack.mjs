export async function installEnglishPack(Recognition) {
 if(typeof Recognition?.install!=='function')throw new Error('Official pack install API absent');
 const installed=await Recognition.install({langs:['en-US'],processLocally:true});
 if(!installed)throw new Error('English pack installation failed');
 return Recognition.available({langs:['en-US'],processLocally:true});
}
