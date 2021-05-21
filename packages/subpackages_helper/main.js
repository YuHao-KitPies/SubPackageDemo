'use strict';
const fs = require('fs');
const path = require('path');
const zipper = require("zip-local");
const crypto = require('crypto');
const moment = require('moment');
const uglifyjs = require("uglify-js");

const COPY_FILE_TYPE_LIST = [
  'asset',
  'texture',
  'sprite-frame',
  'prefab',
  'json',
  'animation-clip',
  'spine',
  'dragonbones',
  'particle',
  'sprite-atlas',
  'dragonbones-atlas',
  'audio-clip',
  'ttf-font',
  'text'
];

const mkdirsSync = function (dirname) {
  if (fs.existsSync(dirname)) {
    return true;
  } else {
    if (mkdirsSync(path.dirname(dirname))) {
      fs.mkdirSync(dirname);
      return true;
    }
  }
}

const copyFile = function (srcPath, tarPath) {
  return new Promise((resolve, reject) => {
    fs.copyFile(srcPath, tarPath, (err) => {
      if (err) {
        error(err);
        resolve();
      } else {
        info(`Copy file '${srcPath}' to target '${tarPath}' successfully.`);
        resolve();
      }
    })
  });
}

const moveFile = function (sourceFile, destPath) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(sourceFile)) {
      fs.rename(sourceFile, destPath, function (err) {
        if (err) {
          error(err);
          resolve();
        } else {
          info(`Move file '${sourceFile}' to target '${destPath}' successfully.`);
          resolve();
        }
      });
    } else {
      warn(`File '${sourceFile}' is not exist.`);
      resolve();
    }
  });
}

const readFile = function (url) {
  return new Promise((resolve, reject) => {
    fs.readFile(url, "utf8", function (err, data) {
      if (err) {
        error(err);
        resolve();
      } else {
        info(`Read file '${url}' successfully.`);
        resolve(data);
      }
    });
  });
}

const writeFile = function (url, data) {
  return new Promise((resolve, reject) => {
    fs.writeFile(url, data, function (err, data) {
      if (err) {
        error(err);
        resolve();
      } else {
        info(`Write file '${url}' successfully.`);
        resolve(data);
      }
    });
  });
}

const delDir = function (path) {
  let files = [];
  if (fs.existsSync(path)) {
    files = fs.readdirSync(path);
    files.forEach((file, index) => {
      let curPath = path + "/" + file;
      if (fs.statSync(curPath).isDirectory()) {
        delDir(curPath); //递归删除文件夹
      } else {
        fs.unlinkSync(curPath); //删除文件
      }
    });
    fs.rmdirSync(path);  // 删除文件夹自身
  }
}

const zipAFolder = function (srcUrl, targetUrl) {
  return new Promise((resolve, reject) => {
    zipper.zip(srcUrl, function (err, zipped) {
      if (!err) {
        zipped.compress();
        zipped.save(targetUrl, function (err) {
          if (!err) {
            info(`Zip ${srcUrl} to ${targetUrl} successfully!`);
            resolve();
          } else {
            error(err);
            resolve();
          }
        });
      } else {
        error(err);
        resolve();
      }
    });
  });
}

const copyAndUglifyJSFile = function (srcPath, tarPath, debug) {
  return new Promise((resolve, reject) => {
    fs.readFile(srcPath, "utf8", function (err, data) {
      if (err) {
        error(err);
        resolve();
      } else {
        info(`Read file '${srcPath}' successfully.`);
        var result = uglifyjs.minify(data, {output: {beautify: debug}});
        if (result.error) {
          error(result.error);
          resolve();
        } else {
          fs.writeFile(tarPath, result.code, function (err, data) {
            if (err) {
              error(err);
              resolve();
            } else {
              info(`Write file '${tarPath}' successfully.`);
              resolve();
            }
          });
        }
      }
    });
  });
}

const computedContentHex = function (content) {
  let hash = crypto.createHash('md5');
  let hex;
  hash.update(content);
  hex = hash.digest('hex');
  return hex;
}

//计算文件的md5
const computedFileHex = function (fileUrl) {
  return new Promise((resolve, reject) => {
    let rs = fs.createReadStream(fileUrl);
    let hash = crypto.createHash('md5');
    let hex;
    rs.on('data', hash.update.bind(hash));

    rs.on('end', function () {
      hex = hash.digest('hex');
      resolve(hex);
    });
  });
}


//遍历找到所有子包
const findAllSubpackages = function (subpackagesInfo) {
  return new Promise((resolve, reject) => {
    Editor.assetdb.deepQuery(function (err, results) {
      if (err) {
        resolve([]);
        error(err);
      } else {
        results.forEach(function (result) {
          if (result.type == 'folder' && subpackagesInfo[result.name]) {
            subpackagesInfo[result.name].searchPath = `${Editor.assetdb.uuidToUrl(result.uuid)}/**\/*`;
          }
        });
        resolve(subpackagesInfo);
      }
    });
  });
}

//遍历一个子包获取子包内容
const traverseAFolder = function (path) {
  return new Promise((resolve, reject) => {
    Editor.assetdb.queryAssets(path, COPY_FILE_TYPE_LIST, function (err, results) {
      if (err) {
        resolve([]);
        error(err);
      } else {
        resolve(results.map(e => e.uuid));
      }
    });
  });
}

//检查一个子包是否依赖其他子包
const checkSubPacakageDep = function (subpackageInfo, checker) {
  return new Promise((resolve, reject) => {
    for (var i = 0; i < subpackageInfo.fUUIDs.length; i++) {
      var depends = checker.getDependencies(subpackageInfo.fUUIDs[i]);
      for (var j = 0; j < depends.length; j++) {
        if (subpackageInfo.cUUIDS.some(e => e == depends[j])) {
          resolve({ result: false, sourseUUID: subpackageInfo.fUUIDs[i], depUUID: depends[j] });
        }
      }
    }
    resolve({ result: true });
  });
}

//移动一个子包的相关资源到子包目录
const moveFilesToSubPacakage = function (subpackageInfo, buildDir) {
  return (async () => {
    let srcPathPrefix = `${buildDir}/res/import/`;
    let distPathPrefix = `${buildDir}/${subpackageInfo.path}import/`;
    for (var i = 0, srcPath, distPath, fileName; i < subpackageInfo.fUUIDs.length; i++) {
      fileName = `${subpackageInfo.fUUIDs[i]}.json`;
      srcPath = `${srcPathPrefix}${subpackageInfo.fUUIDs[i].substring(0, 2)}`;
      distPath = `${distPathPrefix}${subpackageInfo.fUUIDs[i].substring(0, 2)}`;
      mkdirsSync(distPath);
      await moveFile(path.join(srcPath, fileName), path.join(distPath, fileName));
    }
  })();
}

function onBuildFinished(options, callback) {
  if (options.actualPlatform != 'ios') {
    warn(`子包分包小工具，当前只支持原生平台的打包分包功能，请选择打包平台为ios.`);
    callback();
    return;
  }
  if (options.inlineSpriteFrames_native) {
    warn(`子包分包小工具，当前不支持内联SpriteFrame的功能，请取消该选项.`);
    callback();
    return;
  }
  if (options.optimizeHotUpdate) {
    warn(`子包分包小工具，当前不支持合并图集中的SpriteFrame的功能，请取消该选项.`);
    callback();
    return;
  }
  if (options.md5Cache) {
    warn(`子包分包小工具，当前不支持MD5 Cache的功能，请取消该选项.`);
    callback();
    return;
  }
  if (options.encryptJs) {
    warn(`子包分包小工具，当前不支持加密脚本的功能，请取消该选项.`);
    callback();
    return;
  }
  (async () => {
    info('Start search subpackages.');
    var subpackagesInfo = {}, pNames = [];
    for (var item in options.buildResults._subpackages) {
      subpackagesInfo[item] = JSON.parse(JSON.stringify(options.buildResults._subpackages[item]));
      pNames.push(options.buildResults._subpackages[item].name);
    }
    info(`There ${pNames.length > 1 ? 'are' : 'is'} ${pNames.length} subpackages.  ${pNames.length > 1 ? 'They are' : 'It is'} ${pNames.join(', ')}.`);

    //获取子包路径
    info("Start get subpackages's url success.");
    await findAllSubpackages(subpackagesInfo);
    info("Get subpackages's url success.");

    //检查子包名称是否为文件夹名
    for (var item in subpackagesInfo) {
      if (!subpackagesInfo[item].searchPath) {
        error(`Subpackage ${subpackagesInfo[item].name}'s name must be same as the folder name.`);
        callback();
        return;
      }
    }

    //检查子包是否放在了resources中
    for (var item in subpackagesInfo) {
      if (!subpackagesInfo[item].searchPath.startsWith('db://assets/resources')) {
        error(`Subpackage ${subpackagesInfo[item].name} must be placed in the 'assets/resources' folder. Or it's asset will not be built.`);
      }
    }

    // 遍历子包获取内容的UUID列表
    info("Start get subpackages's content uuids success.");
    for (var item in subpackagesInfo) {
      let fileUUIDs = await traverseAFolder(subpackagesInfo[item].searchPath);
      subpackagesInfo[item].fUUIDs = fileUUIDs;
    }
    info("Get subpackages's content uuids success.");

    info("Start the generattion of subpackages's cross reference check information.");
    // 生成子包交叉依赖检查信息
    for (var item in subpackagesInfo) {
      subpackagesInfo[item].cUUIDS = [];
      for (var sitem in subpackagesInfo) {
        if (sitem == item) continue;
        subpackagesInfo[item].cUUIDS = subpackagesInfo[item].cUUIDS.concat(subpackagesInfo[sitem].fUUIDs);
      }
    }
    info("Generate subpackages's cross reference check information success.");

    //检查子包的独立性
    info("Start check subpackages independence.");
    for (var item in subpackagesInfo) {
      let checkResult = await checkSubPacakageDep(subpackagesInfo[item], options.buildResults);
      if (!checkResult.result) {
        error(`The asset whose uuid is 
        ${checkResult.sourseUUID}(${Editor.assetdb.uuidToUrl(checkResult.sourseUUID)})
        depends on the asset whose uuid is 
        ${checkResult.depUUID}(${Editor.assetdb.uuidToUrl(checkResult.depUUID)}), 
        which is not allowed.
        Please make sure subpackages only dependent on common assets.`);
      }
    }
    info("Check subpackages independence completed.");

    //移动子包内的文件的构建结果到子包目录
    for (var item in subpackagesInfo) {
      info(`Start the resource movement of subpackage ${subpackagesInfo[item].name}.`);
      await moveFilesToSubPacakage(subpackagesInfo[item], options.dest);
      info(`Complete the resource movement of subpackage ${subpackagesInfo[item].name}.`);
    }

    //切割setting.js
    info("Start pick subpackages settings.");
    var data = await readFile(`${options.dest}/src/settings.js`);
    var window = {};
    eval(data);
    if (window._CCSettings) {
      data = window._CCSettings;
      info("Start pick subpackages settings step one. Pick asset map.");
      for (var item in subpackagesInfo) {
        let assets = data.rawAssets.assets, tempAssets = {};
        subpackagesInfo[item].assets = {};
        let matchPath = subpackagesInfo[item].searchPath.replace('**/*', '').replace('db://assets/resources/', '');
        for (let item1 in assets) {
          if (assets[item1][0].startsWith(matchPath)) {
            subpackagesInfo[item].assets[item1] = assets[item1];
          } else {
            tempAssets[item1] = assets[item1];
          }
        }
        info(matchPath);
        info(subpackagesInfo[item].assets);
        data.rawAssets.assets = tempAssets;
      }
      info("Pick subpackages settings step one. Pick asset map completed.");

      info("Start pick subpackages settings step two. Split subpackage setting.");
      data.subpackages = {};
      info("Pick subpackages settings step two. Split subpackage setting completed.");

      info("Start pick subpackages settings step three. Rewrite settings.");
      await writeFile(`${options.dest}/src/settings.js`, `window._CCSettings${options.debug ? ' = ' : '='}${options.debug ? JSON.stringify(data, null, 4) : JSON.stringify(data)}`);
      info("Pick subpackages settings step three. Rewrite settings completed.");
    } else {
      error(`Reading ${options.dest}/src/settings.js file error.`);
      callback();
      return;
    }
    info("Pick subpackages settings completed.");

    //读取JS定义中的ID和类名
    info("Start read subpackages js class defination.");
    for (var item in subpackagesInfo) {
      let jsUrl = `${options.dest}/${subpackagesInfo[item].path}index.js`;
      let data = await readFile(jsUrl);
      if (!data) {
        error(`Reading ${jsUrl} file error.`);
        callback();
        return;
      }
      let defs = data.match(/cc\._RF\.push\((.+?)\)/g) || [];
      let temp = defs.map(e => e.match(/\"(.*?)\"/g) || []);
      let idsAndNames = temp.map(e => e.map(ee => ee.replace(/(^\"*)|(\"*$)/g, "")));
      subpackagesInfo[item].jsdefs = idsAndNames;
    }
    info("Read subpackages js class defination complete.");

    //生成子包的config.json
    info("Start generate subpackages settings.");
    for (var item in subpackagesInfo) {
      let data = {};
      data.settings = subpackagesInfo[item].assets || {};
      subpackagesInfo[item].stamp = computedContentHex(JSON.stringify(subpackagesInfo[item].fUUIDs) + new Date().toLocaleString()).substring(0, 5);
      data.subpackages = {};
      data.subpackages[item] = {
        name: subpackagesInfo[item].name,
        path: `${subpackagesInfo[item].path.split('/')[1]}.${subpackagesInfo[item].stamp}/`,//将子包查找路径变为子包名加签名
        uuids: subpackagesInfo[item].fUUIDs,
        jsdefs: subpackagesInfo[item].jsdefs
      };
      data.subPackageName = subpackagesInfo[item].name;
      data.urlPrefix = subpackagesInfo[item].searchPath.replace('**/*', '').replace('db://assets/resources/', '');
      await writeFile(`${options.dest}/${subpackagesInfo[item].path}config.json`, options.debug ? JSON.stringify(data, null, 4) : JSON.stringify(data));
    }
    info("Generate subpackages settings completed.");

    //拷贝扩展子包加载逻辑的代码文件
    info("Start copy codes of loading subpackages.");
    let fileName = 'subpackages_helper.js';
    let pdir = Editor ? path.resolve(__dirname, '.') : path.resolve('.');
    await copyAndUglifyJSFile(`${pdir}/${fileName}`, `${options.dest}/src/${fileName}`, options.debug);
    info("Copy codes of loading subpackages completed.");

    //添加引入子包加载逻辑的代码
    info("Start insert code of requiring loading subpackages code.");
    let mainJsUrl = path.join(options.dest, "main.js");
    let mainJs = await readFile(mainJsUrl);
    if (mainJs) {
      let rawContent = "require('src/cocos2d-jsb.js');";
      let newContent = `require('src/cocos2d-jsb.js');\n        require('src/subpackages_helper.js');`;
      mainJs = mainJs.replace(rawContent, newContent);
    }
    await writeFile(mainJsUrl, mainJs);
    info("Insert code of requiring loading subpackages code completed.");

    //对子包进行打包
    info("Start pack and compress subpackages.");
    let packPath = `${options.buildPath}/subpackages-packs/pack_${moment().format('MM_DD_HH_mm_ss')}/`;
    mkdirsSync(packPath);
    for (var item in subpackagesInfo) {
      await zipAFolder(`${options.dest}/subpackages/${subpackagesInfo[item].name}/`, `${packPath}${subpackagesInfo[item].name}.zip`);
    }
    info("Pack and compress subpackages completed.");

    //对子包进行md5签名
    info("Start generate md5 signature and pack config file.");
    let packConfig = {};
    for (var item in subpackagesInfo) {
      let fileHex = await computedFileHex(`${packPath}${subpackagesInfo[item].name}.zip`);
      let stamp = subpackagesInfo[item].stamp;
      packConfig[subpackagesInfo[item].name] = {
        name: subpackagesInfo[item].name,
        md5: fileHex,
        path: `${subpackagesInfo[item].name}.${stamp}.zip`,
        updateTime: new Date().toLocaleString()
      };
      await moveFile(`${packPath}${subpackagesInfo[item].name}.zip`, `${packPath}${subpackagesInfo[item].name}.${stamp}.zip`)
    }

    //生成子包版本描述文件
    await writeFile(`${packPath}config.json`, options.debug ? JSON.stringify(packConfig, null, 4) : JSON.stringify(packConfig));

    //删除主包里的子包
    delDir(`${options.dest}/subpackages`);
    info("Generate md5 signature and pack config file completed.");

    callback();
  })();
}

const log = function (info) {
  Editor ? Editor.log(info) : console.log(info);
}

const error = function (info) {
  Editor ? Editor.error(info) : console.error(info);
}

const info = function (info) {
  Editor ? Editor.info(info) : console.info(info);
}

const warn = function (info) {
  Editor ? Editor.warn(info) : console.warn(info);
}

module.exports = {
  load() {
    Editor.Builder.on('build-finished', onBuildFinished);
  },
  unload() {
    Editor.Builder.removeListener('build-finished', onBuildFinished);
  }
};





