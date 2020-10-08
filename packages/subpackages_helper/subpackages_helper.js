var proto = cc.Pipeline.Downloader.prototype;
proto.RES_PATH = 'subpackages/';//子包根目录
proto.SUB_PACK_CONFIG_FILE_NAME = 'subpackages.plist';
proto.FOLDER_SEPERATOR = '_';
proto.SIGN_FILE_NAME = '.sign';
proto.SIGN_FILE_CONTENT_TEMPLATE = "Don't modify me! {0}";

proto._launchSubpackageMem = {};

/**
 * 子包类型
 */
proto.SUBPACKAGE_TYPE = {
    LOGIC_SUBPACKAGE: "LOGIC_SUBPACKAGE", //代码子包，由Cocos生成
    DATA_SUBPACKAGE: "DATA_SUBPACKAGE" //配置子包
};

function DownloadTask(task, downloader, progress, complete) {
    this.task = task;
    this.downloader = downloader;
    this._progressCB = progress;
    this._completeCB = complete;
};

DownloadTask.prototype.progress = function (current, total) {
    (!this.isStop) && this._progressCB && this._progressCB(current, total);
};

DownloadTask.prototype.complete = function (result, error) {
    (!this.isStop) && this._completeCB && this._completeCB(result, error);
    this.task = null;
};

/**
 * 停止下载，拦截进度回调和完成回调
 */
DownloadTask.prototype.stop = function () {
    this.isStop = true;
    if (this.downloader && this.task) {
        this.downloader.abort(this.task);
        this.task = null;
        this.downloader = null;
    }
}

/**
 * 下载任务
 */
proto.DownloadTask = DownloadTask;

//获取子包真名
proto._getRealName = function (name, type) {
    return type.concat(this.FOLDER_SEPERATOR).concat(name);
}

//获取子包文件夹真名
proto._getRealFolderName = function (sign, md5) {
    return this._getMixVersion(sign, md5);
}

//获取子包文件夹路径
proto._getRealPath = function (sign, md5) {
    var folderName = this._getRealFolderName(sign, md5);
    var path = jsb.fileUtils.getWritablePath();
    var resPath = path.concat(this.RES_PATH);

    return resPath.concat(folderName);
}

//获取子包配置
proto._getSubPackConfig = function (name, type) {
    var realName = this._getRealName(name, type);
    if (!this.subpackages_config) {
        var path = jsb.fileUtils.getWritablePath();
        var resPath = path.concat(this.RES_PATH);
        var configPath = resPath.concat(this.SUB_PACK_CONFIG_FILE_NAME);
        if (jsb.fileUtils.isFileExist(configPath)) {
            this.subpackages_config = jsb.fileUtils.getValueMapFromFile(configPath);
        }
    }
    return this.subpackages_config && this.subpackages_config[realName];
}

//设置子包配置
proto._setSubPackConfig = function (name, type, md5, sign, fName) {
    var path = jsb.fileUtils.getWritablePath();
    var resPath = path.concat(this.RES_PATH);
    if (!jsb.fileUtils.isDirectoryExist(resPath)) {
        jsb.fileUtils.createDirectory(resPath)
    }
    var configPath = resPath.concat(this.SUB_PACK_CONFIG_FILE_NAME);
    var dict = {};//以配置文件中存在的内容为主
    if (jsb.fileUtils.isFileExist(configPath)) {
        dict = jsb.fileUtils.getValueMapFromFile(configPath);
    }
    dict[this._getRealName(name, type)] = {
        name: name,
        type: type,
        sign: sign,
        md5: md5,
        fName: fName
    };
    this.subpackages_config = dict;//将配置文件中的内容进行缓存
    jsb.fileUtils.writeValueMapToFile(dict, configPath);
}

//清除子包配置
proto._clearSubPackConfig = function (name, type) {
    var path = jsb.fileUtils.getWritablePath();
    var resPath = path.concat(this.RES_PATH);
    var configPath = resPath.concat(this.SUB_PACK_CONFIG_FILE_NAME);
    if (jsb.fileUtils.isFileExist(configPath)) {
        var dict = jsb.fileUtils.getValueMapFromFile(configPath);

        delete dict[this._getRealName(name, type)];
        this.subpackages_config = dict;//将配置文件中的内容进行缓存
        jsb.fileUtils.writeValueMapToFile(dict, configPath);
    } else {
        this.subpackages_config = null;
    }
}

//判断子包文件夹是否完整
proto._isSubPackComplete = function (name, type) {
    var config = this._getSubPackConfig(name, type);
    if (config) {
        var folderPath = this._getRealPath(config.sign, config.md5);
        var signFilePath = folderPath.concat('/').concat(this.SIGN_FILE_NAME);
        var signString = this.SIGN_FILE_CONTENT_TEMPLATE.replace('{0}', this._getRealFolderName(config.sign, config.md5));
        //验证文件夹存在，且文件存在完整标记
        return jsb.fileUtils.isDirectoryExist(folderPath) && jsb.fileUtils.isFileExist(signFilePath) && signString == jsb.fileUtils.getStringFromFile(signFilePath);
    }
}

//为子包写入标记
proto._writeSignToSubPack = function (name, type) {
    var config = this._getSubPackConfig(name, type);
    if (config) {
        var folderPath = this._getRealPath(config.sign, config.md5);
        var signFilePath = folderPath.concat('/').concat(this.SIGN_FILE_NAME);
        if (jsb.fileUtils.isDirectoryExist(folderPath)) {
            var signString = this.SIGN_FILE_CONTENT_TEMPLATE.replace('{0}', this._getRealFolderName(config.sign, config.md5));
            //为子包写入完整标记
            return jsb.fileUtils.writeStringToFile(signString, signFilePath);
        }
    }
}

//清除一个子包文件夹
proto._clearASubpackageFolder = function (sign, md5) {
    var folderPath = this._getRealPath(sign, md5);
    if (folderPath) {
        return (!jsb.fileUtils.isDirectoryExist(folderPath)) || jsb.fileUtils.removeDirectory(folderPath);
    }
}

//校验本地子包的信息状态
proto._validLocalSubpackage = function (name, type) {
    var localConfig = this._getSubPackConfig(name, type);
    var isComplete = this._isSubPackComplete(name, type);
    //如果本地包配置存在但是包文件夹完整标记不存在，则清除包配置信息
    if (localConfig && !isComplete) {
        this._clearSubPackConfig(name, type);
    }
}

//获取混合版本号
proto._getMixVersion = function (sign, md5) {
    sign = sign || '';
    return sign.concat(this.FOLDER_SEPERATOR).concat(md5);
}

//判断本地子包是否需要更新
proto._isLocalSubpackageNeedUpdate = function (name, type, newSign, newMD5) {
    var localConfig = this._getSubPackConfig(name, type);
    var isComplete = this._isSubPackComplete(name, type);
    var needUpdate = true;
    //本地子包存在且完整则进行判断
    if (localConfig && isComplete) {
        var localVersion = this._getMixVersion(localConfig.sign, localConfig.md5);
        var remoteVersion = this._getMixVersion(newSign, newMD5);
        //对比本地子包设置和远端子包设置，判断是否需要更新子包
        needUpdate = remoteVersion != localVersion;
    }
    return needUpdate;
}

//下载大文件
proto._downloadABigFile = function (url, targetPath, identifier, progress, complete) {
    var _this = this;
    if (jsb && !this._downloader) {
        this._downloader = new jsb.Downloader({
            countOfMaxProcessingTasks: 6,
            timeoutInSeconds: 360,//超时时间设置为360s
            tempFileNameSuffix: ".tmp"//临时缓存文件
        });
        this._downloader._pcallback = {};
        this._downloader._ccallback = {};
    }
    if (this._downloader && url && targetPath) {
        this._downloader._pcallback[identifier] = progress;
        this._downloader._ccallback[identifier] = complete;
        this._downloader.setOnFileTaskSuccess(function (task) {
            var complete = _this._downloader._ccallback[task.identifier];
            complete && complete(true);
            delete _this._downloader._ccallback[task.identifier];
            delete _this._downloader._pcallback[task.identifier];
        });
        this._downloader.setOnTaskProgress(function (task, bytesReceived, totalBytesReceived, totalBytesExpected) {
            var progress = _this._downloader._pcallback[task.identifier];
            progress && progress(totalBytesReceived, totalBytesExpected);
        });
        this._downloader.setOnTaskError(function (task, errorCode, errorCodeInternal, errorStr) {
            var complete = _this._downloader._ccallback[task.identifier];
            complete && complete(false, errorStr);
            delete _this._downloader._ccallback[task.identifier];
            delete _this._downloader._pcallback[task.identifier];
        });
        return this._downloader.createDownloadFileTask(url, targetPath, identifier);//创建下载任务
    }
}

//获取文件的MD5值
proto._getFileMD5 = function (url, callback) {
    jsb.fileUtils.calFileMD5(url, callback);
}

//解压一个子包压缩包
proto._unzipAPackFile = function (srcDir, targetDir, fileName, progress, complete) {
    jsb.fileUtils.unZipFile(srcDir, targetDir, fileName, function (current, total) {
        progress && progress(current, total);
    }, function (result, message) {
        complete && complete(result, message);
    });
}

//截取文件名
proto._extractFileName = function (url) {
    var infos = url.split("/");
    return infos.length > 0 && infos[infos.length - 1] && infos[infos.length - 1].replace(/\.[^/.]+$/, "");
}

//清除旧版本子包
proto._clearAOldSubpackageFolder = function (name, type) {
    var config = this._getSubPackConfig(name, type);
    if (config) {
        this._clearASubpackageFolder(config.sign, config.md5);
    }
}

/**
 * 检查一个子包是否需要更新
 * @param {string} name 子包名
 * @param {SUBPACKAGE_TYPE} type 子包类型
 * @param {string} sign 子包标记，用于避免md5冲突
 * @param {string} md5 子包md5值
 * @returns {boolean} 子包需要更新返回true
 */
proto.checkASubpackage = function (name, type, sign, md5){
    var vConfig = [['jsb', jsb], ['name', name], ['type', type], ['sign', sign], ['md5', md5]];
    for (var i = 0, r; i < vConfig.length; i++) {
        r = this._validParams(vConfig[i][0], vConfig[i][1]);
        if (!r.result) {
            cc.warn(r.message);
            return;
        } else {
            r.message && cc.log(r.message);
        }
    }
    return this._checkASubpackage(name, type, sign, md5);
}

/**
 * 批量检查一些子包
 * @param {[{name:string, type:SUBPACKAGE_TYPE, sign:string, md5:string, url:string}]} infos 子包信息数组
 * @returns {Array<boolean>} 子包是否需要更新的列表
 */
proto.checkSomeSubpackages = function (infos){
    if (!infos instanceof Array) {
        cc.warn("Subpackages infos mush be a Array.");
        return;
    }
    if (!jsb) {
        cc.warn("Only support cocos native dev.");
        return;
    }
    for (var i = 0; i < infos.length; i++) {
        var vConfig = [['name', infos[i].name], ['type', infos[i].type], ['sign', infos[i].sign], ['md5', infos[i].md5]];
        for (var j = 0, r; j < vConfig.length; j++) {
            r = this._validParams(vConfig[j][0], vConfig[j][1]);
            if (!r.result) {
                cc.warn("The No.".concat(i + 1).concat(" subpackage params is wrong. ").concat(r.message));
                return;
            } else {
                r.message && cc.log("The No.".concat(i + 1).concat(" subpackage params is wrong. ").concat(r.message));
            }
        }
    }
    return infos.map(function(e){return this._checkASubpackage(e.name, e.type, e.sign, e.md5)}, this);
}

/**
 * 下载一个子包
 * @param {string} name 子包名
 * @param {SUBPACKAGE_TYPE} type 子包类型
 * @param {string} sign 子包标记，用于避免md5冲突
 * @param {string} md5 子包md5值
 * @param {string} url 子包名下载地址
 * @param {(current: number, total: number)=>{}} progress 子包下载进度回调0-1
 * @param {(result: boolean, error: string)=>{}} complete 子包下载完成回调
 * @param {boolean} keepZip 设置为true则保留压缩包
 * @returns {DownloadTask} 下载任务，可以使用stop方法中断正在进行的下载任务
 */
proto.downloadASubpackage = function (name, type, sign, md5, url, progress, complete, keepZip) {
    var vConfig = [['jsb', jsb], ['name', name], ['type', type], ['sign', sign], ['md5', md5], ['url', url]];
    for (var i = 0, r; i < vConfig.length; i++) {
        r = this._validParams(vConfig[i][0], vConfig[i][1]);
        if (!r.result) {
            complete && complete(r.message);
            return;
        } else {
            r.message && cc.log(r.message);
        }
    }
    var downloadTask = new this.DownloadTask(null, this._downloader, progress, complete);
    //校验本地包配置
    var task = this._downloadASubpackage(name, type, sign, md5, url, keepZip, downloadTask.progress, downloadTask.complete);
    downloadTask.task = task;
    return downloadTask;
}

/**
 * 批量下载一些子包
 * @param {[{name:string, type:SUBPACKAGE_TYPE, sign:string, md5:string, url:string}]} infos 子包信息数组
 * @param {(current: number, total: number)=>{}} progress 子包下载进度回调0-1
 * @param {(results: [boolean], errors: [string])=>{}} complete 子包下载完成回调
 * @param {boolean} keepZip 设置为true则保留压缩包
 * @returns {DownloadTask} 下载任务，可以使用stop方法中断正在进行的下载任务
 */
proto.downloadSomeSubpackages = function (infos, progress, complete, keepZip) {
    if (!infos instanceof Array) {
        complete && complete("Subpackages infos mush be a Array.");
        return;
    }
    if (!jsb) {
        complete && complete("Only support cocos native dev.");
        return;
    }
    for (var i = 0; i < infos.length; i++) {
        var vConfig = [['name', infos[i].name], ['type', infos[i].type], ['sign', infos[i].sign], ['md5', infos[i].md5], ['url', infos[i].url]];
        for (var j = 0, r; j < vConfig.length; j++) {
            r = this._validParams(vConfig[j][0], vConfig[j][1]);
            if (!r.result) {
                complete && complete("The No.".concat(i + 1).concat(" subpackage params is wrong. ").concat(r.message));
                return;
            } else {
                r.message && cc.log("The No.".concat(i + 1).concat(" subpackage params is wrong. ").concat(r.message));
            }
        }
    }
    var index = 0, results = [], errors = [], fInfo = infos[index];
    var dAs = this._downloadASubpackage.bind(this);
    var downloadTask = new this.DownloadTask(null, this._downloader, progress, complete);
    cc.log("Start download some subpackages ".concat(JSON.stringify(infos)).concat("."));
    var recursiveDownload = function (info) {
        if (downloadTask.isStop) return;
        return dAs(info.name, info.type, info.sign, info.md5, info.url, keepZip, function (current, total) {
            downloadTask.progress && downloadTask.progress(index / infos.length + current / infos.length, 1);
        }, function (result, error) {
            results[index] = result;
            errors[index] = error;
            index++;
            if (index < infos.length) {
                info = infos[index];
                downloadTask.task = recursiveDownload(info);
            } else {
                cc.log("Download some subpackages complete and the result is ".concat(JSON.stringify(results).concat(results.every(function (e) { return e }) ? ". All subpackages download success." : "Some subpackages download failed.")));
                downloadTask.progress && downloadTask.progress(1, 1);
                downloadTask.complete && downloadTask.complete(results, errors);
            }
        });
    };

    downloadTask.task = recursiveDownload(fInfo);

    return downloadTask;
}

/**
 * 获取一个已经加载好的子包
 * @param {string} name 子包名
 * @param {SUBPACKAGE_TYPE} type 子包类型
 */
proto.getASubpackage = function (name, type) {
    return this._launchSubpackageMem[this._getRealName(name, type)];
}

/**
 * 加载一个子包
 * @param {string} name 子包名
 * @param {SUBPACKAGE_TYPE} type 子包类型
 * @param {(error: string, bundle: cc.Pipeline.Downloader.Bundle)=>{}} callback 子包启动完成回调
 */
proto.launchASubpackage = function (name, type, callback) {
    var vConfig = [['jsb', jsb], ['name', name], ['type', type]];
    for (var i = 0, r; i < vConfig.length; i++) {
        r = this._validParams(vConfig[i][0], vConfig[i][1]);
        if (!r.result) {
            callback && callback(r.message);
            return;
        }
    }
    this._launchASubpackage(name, type, callback);
}

/**
 * 卸载一个子包
 * @param {string} name 子包名
 * @param {SUBPACKAGE_TYPE} type 子包类型
 * @param {(error: string)=>{}} callback 卸载子包完成回调
 */
proto.shutASubpackage = function (name, type, callback) {
    var vConfig = [['jsb', jsb], ['name', name], ['type', type]];
    for (var i = 0, r; i < vConfig.length; i++) {
        r = this._validParams(vConfig[i][0], vConfig[i][1]);
        if (!r.result) {
            callback && callback(r.message);
            return;
        }
    }
    this._shutASubpackage(name, type, callback);
}

/**
 * 启动一些子包
 * @param {[{name:string, type:SUBPACKAGE_TYPE}]} infos 子包信息数组
 * @param {(errors: [string], bundles: [cc.Pipeline.Downloader.Bundle])=>{}} callback 子包启动完成回调
 */
proto.launchSomeSubpackages = function (infos, callback) {
    if (!infos instanceof Array) {
        callback && callback("Subpackages infos mush be a Array.");
        return;
    }
    if (!jsb) {
        callback && callback("Only support cocos native dev.");
        return;
    }
    for (var i = 0; i < infos.length; i++) {
        var vConfig = [['name', infos[i].name], ['type', infos[i].type]];
        for (var j = 0, r; j < vConfig.length; j++) {
            r = this._validParams(vConfig[j][0], vConfig[j][1]);
            if (!r.result) {
                callback && callback("The No.".concat(i + 1).concat(" subpackage params is wrong. ").concat(r.message));
                return;
            }
        }
    }
    var index = 0, bundles = [], errors = [], fInfo = infos[index];
    var lAs = this._launchASubpackage.bind(this);
    cc.log("Start launch some subpackages ".concat(JSON.stringify(infos)).concat("."));
    var recursiveLaunch = function (info) {
        lAs(info.name, info.type, function (error, bundle) {
            bundles[index] = bundle;
            errors[index] = error;
            index++;
            if (index < infos.length) {
                info = infos[index];
                recursiveLaunch(info);
            } else {
                cc.log("Launch some subpackages complete and the result is ".concat(JSON.stringify(errors).concat(errors.every(function (e) { return !e }) ? "All subpackages launch success." : "Some subpackages launch failed.")));
                callback && callback(errors, bundles);
            }
        });
    };

    recursiveLaunch(fInfo);
}

/**
 * 卸载一些子包
 * @param {[{name:string, type:SUBPACKAGE_TYPE}]} infos 子包信息数组
 * @param {(errors: [string])=>{}} callback 子包卸载完成回调
 */
proto.shutSomeSubpackages = function (infos, callback) {
    if (!infos instanceof Array) {
        callback && callback("Subpackages infos mush be a Array.");
        return;
    }
    if (!jsb) {
        callback && callback("Only support cocos native dev.");
        return;
    }
    for (var i = 0; i < infos.length; i++) {
        var vConfig = [['name', infos[i].name], ['type', infos[i].type]];
        for (var j = 0, r; j < vConfig.length; j++) {
            r = this._validParams(vConfig[j][0], vConfig[j][1]);
            if (!r.result) {
                callback && callback("The No.".concat(i + 1).concat(" subpackage params is wrong. ").concat(r.message));
                return;
            }
        }
    }
    var index = 0, errors = [], fInfo = infos[index];
    var sAs = this._shutASubpackage.bind(this);
    cc.log("Start shut some subpackages ".concat(JSON.stringify(infos)).concat("."));
    var recursiveShut = function (info) {
        sAs(info.name, info.type, function (error, bundle) {
            errors[index] = error;
            index++;
            if (index < infos.length) {
                info = infos[index];
                recursiveShut(info);
            } else {
                cc.log("Launch some subpackages complete and the result is ".concat(JSON.stringify(errors).concat(errors.every(function (e) { return !e }) ? "All subpackages launch success." : "Some subpackages launch failed.")));
                callback && callback(errors);
            }
        });
    };

    recursiveShut(fInfo);
}

//加载逻辑子包
proto._loadSubpackageSuper = function (url, completeCallback) {
    //加载子包配置信息 config.js
    var subpackageConfig = jsb.fileUtils.getStringFromFile(url + '/config.json');

    if (subpackageConfig) {
        subpackageConfig = JSON.parse(subpackageConfig);

        //注入子包资源映射，设置子包加载路径解析管线
        cc.AssetLibrary.addASubPackage(subpackageConfig);
        //加载子包脚本文件
        this.loadSubpackage(subpackageConfig.subPackageName, function (err) {
            completeCallback(err, subpackageConfig);
        });
    } else {
        completeCallback && completeCallback("Can't find config file.");
    }
};

//卸载逻辑子包
proto._unLoadSubpackageSuper = function (url, completeCallback) {
    //加载子包配置信息 config.js
    var subpackageConfig = jsb.fileUtils.getStringFromFile(url + '/config.json');

    if (subpackageConfig) {
        subpackageConfig = JSON.parse(subpackageConfig);

        var jsDefs = subpackageConfig.subpackages[subpackageConfig.subPackageName].jsdefs;

        //卸载子包脚本文件
        cc.js.unregisterClassByPro(jsDefs);

        //清理子包资源映射，清理子包加载路径解析管线
        cc.AssetLibrary.removeASubPackage(subpackageConfig);

        completeCallback && completeCallback();
    } else {
        completeCallback && completeCallback("Can't find config file.");
    }
};

proto._shutASubpackage = function (name, type, callback) {
    //校验子包启动记录，没有启动的子包，不用进行卸载
    if (!this._launchSubpackageMem[this._getRealName(name, type)] || this._launchSubpackageMem[this._getRealName(name, type)] == 'loading') {
        var errInfo = "The subpackages ".concat(name).concat(" of type ").concat(type).concat(" isn't launched yet.");
        cc.log(errInfo);
        callback && callback(errInfo);
        return;
    }
    var subpackageConfig = this._getSubPackConfig(name, type);
    if (subpackageConfig) {
        var subpackagePath = this._getRealPath(subpackageConfig.sign, subpackageConfig.md5);
        var subpackageContentPath = subpackagePath.concat('/').concat(subpackageConfig.fName);
        var searchPaths = jsb.fileUtils.getSearchPaths();
        searchPaths = searchPaths.filter(function (e) { return e != subpackagePath; });
        //清除搜索路径
        jsb.fileUtils.setSearchPaths(searchPaths);
        if (type == this.SUBPACKAGE_TYPE.LOGIC_SUBPACKAGE) {
            this._unLoadSubpackageSuper(subpackageContentPath, function (err) {
                var errInfo = "UnLaunching subpackages ".concat(name).concat(" of type ").concat(type).concat(err ? " success." : " failed.");
                cc.log(errInfo);
                err && cc.error(JSON.stringify(err));
                callback && callback(errInfo);
                //清理子包启动记录
                delete this._launchSubpackageMem[this._getRealName(name, type)];
            });
        } else {
            //释放资源
            callback && callback();
            //清理子包启动记录
            delete this._launchSubpackageMem[this._getRealName(name, type)];
        }
    } else {
        var errInfo = "Can't find subpackages ".concat(name).concat(" of type ").concat(type).concat(" in local. Please download it before launching.");
        cc.log(errInfo);
        callback && callback(errInfo);
    }
}

proto._launchASubpackage = function (name, type, callback) {
    this._validLocalSubpackage(name, type);
    cc.log("Valid local subpackage %s config of type %s complete.", name, type);
    //校验子包启记录，一个子包只能启动一次
    if (this._launchSubpackageMem[this._getRealName(name, type)]) {
        var errInfo = "The subpackages ".concat(name).concat(" of type ").concat(type).concat(" has be launched already. You can only launch the subpackage once.");
        cc.log(errInfo);
        callback && callback(null, this._launchSubpackageMem[this._getRealName(name, type)]);
        return;
    }
    //添加子包启动记录
    this._launchSubpackageMem[this._getRealName(name, type)] = 'loading';
    var subpackageConfig = this._getSubPackConfig(name, type);
    if (subpackageConfig) {
        var subpackagePath = this._getRealPath(subpackageConfig.sign, subpackageConfig.md5);
        var subpackageContentPath = subpackagePath.concat('/').concat(subpackageConfig.fName);
        //设置搜索路径
        jsb.fileUtils.addSearchPath(subpackagePath, true);
        if (type == this.SUBPACKAGE_TYPE.LOGIC_SUBPACKAGE) {
            var _this = this;
            this._loadSubpackageSuper(subpackageContentPath, function (err, config) {
                var errInfo = "Launching subpackages ".concat(name).concat(" of type ").concat(type).concat(!err ? " success." : " failed.");
                cc.log(errInfo);
                if (err) {
                    cc.error(JSON.stringify(err));
                    callback && callback(errInfo);
                } else {
                    var bundle = new _this.Bundle(name, type, config.urlPrefix, config.subpackages[config.subPackageName].uuids);
                    //覆盖添加子包启动记录
                    _this._launchSubpackageMem[_this._getRealName(name, type)] = bundle;
                    callback && callback(null, bundle);
                }
            });
        } else if (type == this.SUBPACKAGE_TYPE.DATA_SUBPACKAGE) {
            var errInfo = "Launching subpackages ".concat(name).concat(" of type ").concat(type).concat(" success.");
            cc.log(errInfo);
            var bundle = new this.Bundle(name, type, subpackageContentPath);
            //覆盖添加子包启动记录
            this._launchSubpackageMem[this._getRealName(name, type)] = bundle;
            callback && callback(null, bundle);
        }
    } else {
        var errInfo = "Can't find subpackages ".concat(name).concat(" of type ").concat(type).concat(" in local. Please download it before launching.");
        cc.log(errInfo);
        callback && callback(errInfo);
        //清理子包启动记录
        delete this._launchSubpackageMem[this._getRealName(name, type)];
    }
}

proto._checkASubpackage = function (name, type, sign, md5){
    this._validLocalSubpackage(name, type);
    cc.log("Valid local subpackage %s config of type %s complete.", name, type);
    var needUpdate = this._isLocalSubpackageNeedUpdate(name, type, sign, md5);
    return needUpdate;
}

proto._downloadASubpackage = function (name, type, sign, md5, url, keepZip, progress, complete) {
    this._validLocalSubpackage(name, type);
    cc.log("Valid local subpackage %s config of type %s complete.", name, type);
    //判断本地包是否需要更新
    var needUpdate = this._isLocalSubpackageNeedUpdate(name, type, sign, md5);
    if (needUpdate) {
        //判断新的子包文件夹是否存在
        var packPath = this._getRealPath(sign, md5);
        if (jsb.fileUtils.isDirectoryExist(packPath)) {
            jsb.fileUtils.removeDirectory(packPath);
        }
        jsb.fileUtils.createDirectory(packPath);

        var fileName = this._extractFileName(url);
        var filePath = packPath.concat('/').concat(fileName).concat('.zip');
        cc.log('Start download subpackage %s of type %s to %s.', name, type, filePath);
        //下载一个子包压缩包
        return this._downloadNewSubpack(url, filePath, progress, name, type, md5, packPath, fileName, keepZip, sign, complete);
    } else {
        //本地子包已经是最新的
        var info = "Subpackage ".concat(name).concat(" of type ").concat(type).concat(" is up to date.");
        cc.log(info);
        complete && complete(true, info);
    }
}

proto._validParams = function (name, value) {
    if (name == 'jsb') {
        return {
            result: !!value,
            message: value ? '' : "Only support cocos native dev."
        }
    } else if (name == 'name') {
        return {
            result: !!value,
            message: value ? '' : "The subpackage name must not be null!"
        }
    } else if (name == 'type') {
        var temp = (value != this.SUBPACKAGE_TYPE.LOGIC_SUBPACKAGE && value != this.SUBPACKAGE_TYPE.DATA_SUBPACKAGE);
        return {
            result: !temp,
            message: !temp ? '' : "The subpackage type must be a type of cc.Pipeline.Downloader.SUBPACKAGE_TYPE!"
        }
    } else if (name == 'md5') {
        return {
            result: !!value,
            message: value ? '' : "The subpackage md5 must not be null!"
        }
    } else if (name == 'url') {
        return {
            result: !!value,
            message: value ? '' : "The subpackage url must not be null!"
        }
    } else if (name == 'sign') {
        return {
            result: true,
            message: value ? '' : "The subpackage sign is useful to resolve md5 conflict!"
        }
    } else {
        return {
            result: true,
            message: ''
        }
    }
}

proto._downloadNewSubpack = function (url, filePath, progress, name, type, md5, packPath, fileName, keepZip, sign, complete) {
    var _this = this;
    return this._downloadABigFile(url, filePath, this._getRealName(name, type), function (current, total) {
        progress && progress(0.5 * current / total, 1);
    }, function (result, errorStr) {
        if (result) {
            cc.log("Download subpackage %s of type %s get success.", name, type);
            //校验文件
            _this._verifyMD5(filePath, md5, name, type, packPath, fileName, progress, keepZip, sign, complete);
        } else {
            cc.log("Download subpackage %s of type %s get error.", name, type);
            complete && complete(false, errorStr);
        }
    });
}

proto._verifyMD5 = function (filePath, md5, name, type, packPath, fileName, progress, keepZip, sign, complete) {
    var _this = this;
    this._getFileMD5(filePath, function (result, info) {
        if (info == md5) {
            cc.log("The download subpackage %s's md5 of type %s is %s and pass verification.", name, type, info);
            //解压一个子包压缩包
            _this._unzipAction(packPath, fileName, progress, keepZip, filePath, name, type, md5, sign, complete);
        } else {
            cc.log("The download subpackage %s of type %s has broken. Eorror info is '%s'.", name, type, result ? "File md5 is not trusted." : info);
            complete && complete(false, "The download subpackage ".concat(name).concat(" of type ").concat(type).concat(" file has broken."));
        }
    });
}

proto._unzipAction = function (packPath, fileName, progress, keepZip, filePath, name, type, md5, sign, complete) {
    var _this = this;
    this._unzipAPackFile(packPath, packPath.concat('/').concat(fileName), fileName, function (current, total) {
        progress && progress(0.5 + 0.5 * current / total, 1);
    }, function (result, error) {
        if (result) {
            cc.log("Unzip subpackage %s's zip file of type %s get success.", name, type);
            //清除旧版子包
            _this._clearAOldSubpackageFolder(name, type);
            //保存子包信息到本地
            _this._setSubPackConfig(name, type, md5, sign, fileName);
            //写入文件完整标记
            _this._writeSignToSubPack(name, type);

            //删除压缩包
            _this._removeZipFile(keepZip, filePath, name, type);
            var info = "Download subpackage ".concat(name).concat(" of type ").concat(type).concat(" finish.");
            complete && complete(true, info);
        } else {
            cc.log("Unzip subpackage %s of type %s get error.", name, type);
            //删除压缩包
            _this._removeZipFile(keepZip, filePath, name, type);
            complete && complete(false, error);
        }
    });
}

proto._removeZipFile = function (keepZip, filePath, name, type) {
    if (!keepZip) {
        jsb.fileUtils.removeFile(filePath);
        cc.log("Remove subpackage %s's zip file of type %s get success.", name, type);
    }
}

/**
 * 子包对象
 * @param {string} name 子包名
 * @param {SUBPACKAGE_TYPE} type 子包类型
 * @param {string} baseUrl 子包文件内容地址
 * @param {[string]} uuids 用于记录逻辑子包的uuids
 */
function Bundle(name, type, baseUrl, uuids) {
    this._name = name;
    this._type = type;
    this._baseUrl = baseUrl;
    this._uuids = uuids;
    this._resMap = {};
    this._cacheUrls = {};
}

var bProto = Bundle.prototype;

bProto._getRealUrl = function (url) {
    if (this._baseUrl[this._baseUrl.length - 1] != '/') {
        this._baseUrl += '/';
    }
    return this._baseUrl + url;
}

bProto._getExtSuggest = function (type) {
    if (type == cc.JsonAsset) {
        return ['.json'];
    } else if (type == cc.Texture2D) {
        return ['.png', '.jpg', '.jpeg'];
    } else if (type == cc.AudioClip) {
        return ['.mp3', '.wav'];
    } else if (type == cc.SpriteFrame) {
        return ['.png', '.jpg', '.jpeg'];
    } else if (type == cc.TextAsset) {
        return ['.txt', '.plist', '.xml', '.yaml', '.ini', '.csv', '.md'];
    } else {
        return [];
    }
}

bProto._hasExt = function (url) {
    var map = ['.png', '.jpg', '.jpeg', '.mp3', '.wav', '.txt', '.plist', '.xml', '.json', '.yaml', '.ini', '.csv', '.md'];
    var index = url.lastIndexOf('.');
    var ext = url.substring(index);
    return map.some(function (e) { return e == ext });
}

bProto._cutExt = function (url) {
    var index = url.lastIndexOf('.');
    var nUrl = url.substring(0, index);
    return nUrl;
}

bProto._getRealExtUrl = function (url, type) {
    var rurl = this._getRealUrl(url);
    if (this._hasExt(url)) {//设置了类型，则要清除原本的后缀
        cc.warn("It needn't add extention to file url when use asset in data subpackages. See: %s", url);
        rurl = this._cutExt(rurl);
    }
    if (type) { //设置了类型，使用类型的建议后缀查找文件
        var eSuggests = this._getExtSuggest(type);
        for (var i = 0; i < eSuggests.length; i++) {
            if (jsb.fileUtils.isFileExist(rurl + eSuggests[i])) {
                return rurl + eSuggests[i];
            }
        }
    } else { //不设置类型，则依次查找存在的资源
        var eSuggests = ['.png', '.jpg', '.jpeg', '.mp3', '.wav', '.txt', '.plist', '.xml', '.json', '.yaml', '.ini', '.csv', '.md'];
        for (var i = 0; i < eSuggests.length; i++) {
            if (jsb.fileUtils.isFileExist(rurl + eSuggests[i])) {
                return rurl + eSuggests[i];
            }
        }
    }
    return rurl;
}

bProto._isExt = function (url, ext) {
    var index = url.lastIndexOf('.');
    var next = url.substring(index);
    return next == ext;
}

bProto._isExts = function (url, exts) {
    var index = url.lastIndexOf('.');
    var next = url.substring(index);
    return exts.some(function (e) { return e == next; });
}

bProto._packAsset = function (asset, type, url) {
    this._cacheAAssetUrl(url);
    if (type == cc.SpriteFrame && asset instanceof cc.Texture2D) {
        var r = this._getAsset(cc.SpriteFrame, url);
        if (!r) {
            r = new cc.SpriteFrame(asset);
            this._cacheAsset(r, cc.SpriteFrame, url);
        }
        return r;
    } else if (type == cc.JsonAsset && this._isExt(url, '.json') || this._isExt(url, '.json') && type != cc.TextAsset) {
        var r = this._getAsset(cc.JsonAsset, url);
        if (!r) {
            r = new cc.JsonAsset();
            r.json = typeof asset == 'string' ? JSON.parse(asset) : asset;
            r.url = url;
            this._cacheAsset(r, cc.JsonAsset, url);
        }
        return r;
    } else if (this._isExts(url, ['.txt', '.plist', '.xml', '.yaml', '.ini', '.csv', '.md'])) {
        var r = this._getAsset(cc.TextAsset, url);
        if (!r) {
            r = new cc.TextAsset();
            r.text = typeof asset == 'object' ? JSON.stringify(asset) : asset;
            r.url = url;
            this._cacheAsset(r, cc.TextAsset, url);
        }
        return r;
    } else {
        return asset;
    }
}

bProto._getAssetTypeName = function (type, url) {
    if (type == cc.SpriteFrame) {
        return 'SpriteFrame';
    } else if (type == cc.JsonAsset) {
        return 'JsonAsset';
    } else if (type == cc.TextAsset) {
        return 'TextAsset';
    } else {
        if (this._isExts(url, ['.png', '.jpg', '.jpeg'])) {
            return 'SpriteFrame';
        } else if (this._isExt(url, '.json')) {
            return 'JsonAsset';
        } else if (this._isExts(url, ['.txt', '.plist', '.xml', '.yaml', '.ini', '.csv', '.md'])) {
            return 'TextAsset';
        }
    }
}

bProto._getAssetInfo = function (type) {
    if (type instanceof cc.SpriteFrame) {
        return {
            type: cc.SpriteFrame,
            url: type.getTexture().url
        };
    } else if (type instanceof cc.JsonAsset) {
        return {
            type: cc.JsonAsset,
            url: type.url,
            clearRaw: true
        };
    } else if (type instanceof cc.TextAsset) {
        return {
            type: cc.TextAsset,
            url: type.url,
            clearRaw: true
        };
    }
}

bProto._isPackAsset = function (type) {
    return (type instanceof cc.SpriteFrame) || (type instanceof cc.JsonAsset) || (type instanceof cc.TextAsset);
}

bProto._cacheAAssetUrl = function (url) {
    if (!this._cacheUrls[url]) {
        this._cacheUrls[url] = [];
    }
    this._cacheUrls[url].push(url);
}

bProto._getAllCacheUrls = function () {
    var r = [];
    for (var item in this._cacheUrls) {
        r.push.apply(r, this._cacheUrls[item]);
    }
    return r;
}

bProto._cacheAsset = function (asset, type, url) {
    var nurl = this._cutExt(url);
    if (!this._resMap[nurl]) {
        this._resMap[nurl] = {};
    }
    var aName = this._getAssetTypeName(type, url);
    this._resMap[nurl][aName] = asset;
}

bProto._clearAsset = function (type, url) {
    var nurl = this._cutExt(url), asset;
    var aName = this._getAssetTypeName(type, url);
    if (this._resMap[nurl] && this._resMap[nurl][aName]) {
        asset = this._resMap[nurl][aName];
        asset.destroy && asset.destroy();
        delete this._resMap[nurl][aName];
    }
}

bProto._getAsset = function (type, url) {
    var nurl = this._cutExt(url);
    var aName = this._getAssetTypeName(type, url);
    if (this._resMap[nurl] && this._resMap[nurl][aName]) {
        return this._resMap[nurl][aName];
    }
}

bProto._clearAllAsset = function () {
    var asset;
    for (var item in this._resMap) {
        for (iitem in this._resMap[item]) {
            asset = this._resMap[item][iitem];
            asset.destroy && asset.destroy();
        }
    }
    this._resMap = {};
}

bProto._parseParams = function (type, progressCallback, completeCallback) {
    if (completeCallback == undefined && progressCallback == undefined && type) {
        if (!(type.prototype instanceof cc.Asset)) {
            completeCallback = type;
            type = undefined;
        }
    } else if (completeCallback == undefined && progressCallback && type) {
        if (!(type.prototype instanceof cc.Asset)) {
            completeCallback = progressCallback;
            progressCallback = type;
            type = undefined;
        } else {
            completeCallback = progressCallback;
            progressCallback = undefined;
        }
    }
    return [type, progressCallback, completeCallback];
}

/**
 * 加载单个资源，其使用方式与Cocos Creator API一致
 * 
 * @param {string} url 资源路径，相对于子包根目录，不需要添加扩展名
 * @param {cc.Asset} type 只有type指定的类型的资源会被加载
 * @param {Function} [progressCallback] 加载进度回调
 * @param {Number} progressCallback.completedCount 已加载完成的数目
 * @param {Number} progressCallback.totalCount 总共需要加载的数目
 * @param {Object} progressCallback.item The latest item which flow out the pipeline.
 * @param {Function} [completeCallback] 加载完成回调.
 * @param {Error} completeCallback.error 错误信息，加载成功则为空
 * @param {Object} completeCallback.resource 加载完成的资源，加载错误返回空
 * @example
 * 
 * // 从子包test中加载预制资源 (test/misc/character/cocos)
 * bundle.loadRes('misc/character/cocos', function (err, prefab) {
 *     if (err) {
 *         cc.error(err.message || err);
 *         return;
 *     }
 *     cc.log('Result should be a prefab: ' + (prefab instanceof cc.Prefab));
 * });
 *
 * // 从子包test中加载sprite frame (test/imgs/cocos.png) 
 * bundle.loadRes('imgs/cocos', cc.SpriteFrame, function (err, spriteFrame) {
 *     if (err) {
 *         cc.error(err.message || err);
 *         return;
 *     }
 *     cc.log('Result should be a sprite frame: ' + (spriteFrame instanceof cc.SpriteFrame));
 * });
 */
bProto.loadRes = function (url, type, progressCallback, completeCallback) {
    if (typeof url != 'string') {
        var p = this._parseParams(type, progressCallback, completeCallback);
        type = p[0]; progressCallback = p[1]; completeCallback = p[2];
        completeCallback && completeCallback("Resourse url must be a string.");
        return;
    }
    if (this._type == cc.loader.downloader.SUBPACKAGE_TYPE.LOGIC_SUBPACKAGE) {
        cc.loader.loadRes(this._getRealUrl(url), type, progressCallback, completeCallback);
    } else if (this._type == cc.loader.downloader.SUBPACKAGE_TYPE.DATA_SUBPACKAGE) {
        var _this = this;
        var p = this._parseParams(type, progressCallback, completeCallback);
        type = p[0]; progressCallback = p[1]; completeCallback = p[2];

        var eUrl = _this._getRealExtUrl(url, type);
        var params = [eUrl];
        progressCallback && params.push(progressCallback);
        params.push(function (err, res) {
            completeCallback && completeCallback(err, !err ? _this._packAsset(res, type, eUrl) : null);
        });
        cc.loader.load.apply(cc.loader, params);
    }
}

/**
 * 加载资源列表，其使用方式与Cocos Creator API一致
 * 
 * @param {[string]} urls 资源路径列表，相对于子包根目录，不需要添加扩展名
 * @param {cc.Asset} type 只有type指定的类型的资源会被加载
 * @param {Function} [progressCallback] 加载进度回调
 * @param {Number} progressCallback.completedCount 已加载完成的数目
 * @param {Number} progressCallback.totalCount 总共需要加载的数目
 * @param {Object} progressCallback.item The latest item which flow out the pipeline.
 * @param {Function} [completeCallback] 加载完成回调.
 * @param {Error} completeCallback.error 错误信息，加载成功则为空
 * @param {Asset[]|Array} completeCallback.assets 加载完成的资源列表，加载错误返回空
 * @example
 * 
 * // 从子包test中加载预制资源列表 (test/misc/character/cocos, test/misc/character/haha)
 * bundle.loadResArray(['misc/character/cocos', 'misc/character/haha'], function (err, prefabs) {
 *     if (err) {
 *         cc.error(err.message || err);
 *         return;
 *     }
 *     cc.log('Result should be a prefab array: ' + (prefabs instanceof Array) + '. prefabs[0] should be a prefab: ' + (prefabs instanceof cc.Prefab));
 * });
 *
 * // 从子包test中加载sprite frame列表 (test/imgs/cocos.png, test/imgs/haha.png) 
 * bundle.loadResArray(['imgs/cocos', 'imgs/haha'], cc.SpriteFrame, function (err, spriteFrames) {
 *     if (err) {
 *         cc.error(err.message || err);
 *         return;
 *     }
 *     cc.log('Result should be a sprite frame array: ' + (spriteFrames instanceof Array) + '. spriteFrames[0] should be a sprite frame: ' + (spriteFrames[0] instanceof cc.SpriteFrame));
 * });
 */
bProto.loadResArray = function (urls, type, progressCallback, completeCallback) {
    if (!(urls instanceof Array)) {
        var p = this._parseParams(type, progressCallback, completeCallback);
        type = p[0]; progressCallback = p[1]; completeCallback = p[2];
        completeCallback && completeCallback("Resourse urls must be a array.");
        return;
    }
    if (this._type == cc.loader.downloader.SUBPACKAGE_TYPE.LOGIC_SUBPACKAGE) {
        var nurls = urls.map(function (e) { return this._getRealUrl(e) }, this);
        cc.loader.loadResArray(nurls, type, progressCallback, completeCallback);
    } else if (this._type == cc.loader.downloader.SUBPACKAGE_TYPE.DATA_SUBPACKAGE) {
        var _this = this;
        var p = this._parseParams(type, progressCallback, completeCallback);
        type = p[0]; progressCallback = p[1]; completeCallback = p[2];

        var nurls = urls.map(function (e) { return _this._getRealExtUrl(e, type) }, _this);
        var params = [nurls];
        progressCallback && params.push(progressCallback);
        params.push(function (errs, reses) {
            var nReses = [];
            if (!errs) {
                nReses = nurls.map(function (e) { return _this._packAsset(reses.getContent(e), type, e) });
            }
            completeCallback && completeCallback(errs, nReses);
        });
        cc.loader.load.apply(cc.loader, params);
    }
}

/**
 * 加载资源文件夹，其使用方式与Cocos Creator API一致
 * 
 * @param {[string]} urls 资源路径列表，相对于子包根目录，不需要添加扩展名
 * @param {cc.Asset} type 只有type指定的类型的资源会被加载
 * @param {Function} [progressCallback] 加载进度回调
 * @param {Number} progressCallback.completedCount 已加载完成的数目
 * @param {Number} progressCallback.totalCount 总共需要加载的数目
 * @param {Object} progressCallback.item The latest item which flow out the pipeline.
 * @param {Function} [completeCallback] 加载完成回调.
 * @param {Error} completeCallback.error 错误信息，加载成功则为空
 * @param {Asset[]|Array} completeCallback.assets 加载完成的资源列表，加载错误返回空
 * @param {String[]} completeCallback.urls 加载完成的资源路径列表
 * @example
 * 
 * // 从子包test中加载资源文件夹cocos中的所有内容 (test/cocos)
 * bundle.loadResDir('cocos', function (err, assets, urls) {
 *     if (err) {
 *         cc.error(err.message || err);
 *         return;
 *     }
 *     cc.log('Result should be a assets array: ' + (assets instanceof Array));
 * });
 */
bProto.loadResDir = function (url, type, progressCallback, completeCallback) {
    if (typeof url != 'string') {
        var p = this._parseParams(type, progressCallback, completeCallback);
        type = p[0]; progressCallback = p[1]; completeCallback = p[2];
        completeCallback && completeCallback("Resourse folder url must be a string.");
        return;
    }
    if (this._type == cc.loader.downloader.SUBPACKAGE_TYPE.LOGIC_SUBPACKAGE) {
        cc.loader.loadResDir(this._getRealUrl(url), type, progressCallback, completeCallback);
    } else if (this._type == cc.loader.downloader.SUBPACKAGE_TYPE.DATA_SUBPACKAGE) {
        var _this = this;
        var p = this._parseParams(type, progressCallback, completeCallback);
        type = p[0]; progressCallback = p[1]; completeCallback = p[2];

        var rUrl = this._getRealUrl(url);
        if (!jsb.fileUtils.isDirectoryExist(rUrl)) {
            completeCallback && completeCallback('Resource folder is not exist.');
            return;
        }
        var nurls = jsb.fileUtils.listFiles(rUrl) || [];

        nurls = nurls.filter(function (e) { return e.substring(e.length - 2) != './' });
        //过滤类型
        if (type) {
            var sext = this._getExtSuggest(type);
            nurls = nurls.filter(function (e) { return _this._isExts(e, sext) }, _this);
        }

        var params = [nurls];
        progressCallback && params.push(progressCallback);
        params.push(function (errs, reses) {
            var nReses = [];
            if (!errs) {
                nReses = nurls.map(function (e) { return _this._packAsset(reses.getContent(e), type, e) });
            }
            completeCallback && completeCallback(errs, nReses, nurls);
        });
        cc.loader.load.apply(cc.loader, params);
    }
}

/**
 * 获取加载好的资源，其使用方式与Cocos Creator API一致
 * 
 * @param {[string]} urls 资源路径列表，相对于子包根目录，不需要添加扩展名
 * @param {cc.Asset} type 只有type指定的类型的资源会被加载
 * @returns {cc.Asset} 如果有已经加载好的资源则返回资源，否则返回空
 */
bProto.getRes = function (url, type) {
    if (this._type == cc.loader.downloader.SUBPACKAGE_TYPE.LOGIC_SUBPACKAGE) {
        return cc.loader.getRes(this._getRealUrl(url), type);
    } else if (this._type == cc.loader.downloader.SUBPACKAGE_TYPE.DATA_SUBPACKAGE) {
        var r = this._getAsset(type, this._getRealExtUrl(url, type));
        if (!r) {
            r = cc.loader.getRes(this._getRealExtUrl(url, type), type);
        }
        return r;
    }
}

/**
 * 释放指定的资源，其使用方式与Cocos Creator API一致
 * 
 * @param {cc.Asset|RawAsset|String|Array} asset 资源实例，url，uuid或者url数组，uuid数组
 */
bProto.release = function (asset) {//使用资源名卸载，有重名资源只卸载cc.Texture2D，否则卸载最先找到的资源
    var UuidRegex = /[0-9a-fA-F-]{8,}/;
    var _this = this;
    if (this._type == cc.loader.downloader.SUBPACKAGE_TYPE.LOGIC_SUBPACKAGE) {//系统默认
        if (typeof asset == 'string' && !UuidRegex.test(asset)) {
            asset = this._getRealUrl(asset);
        } else if (asset instanceof Array) {
            asset = asset.map(function (e) { return UuidRegex.test(e) ? e : _this._getRealUrl(e); })
        }
        cc.loader.release(asset);
    } else if (this._type == cc.loader.downloader.SUBPACKAGE_TYPE.DATA_SUBPACKAGE) {
        if (this._isPackAsset(asset)) {
            var aInfo = this._getAssetInfo(asset);
            this._clearAsset(aInfo.type, aInfo.url);//释放包装类型资源
            if (aInfo.clearRaw) {
                cc.loader.release(aInfo.url);//释放原始资源
            }
        } else {//使用资源名卸载时，有重名资源只卸载cc.Texture2D，否则卸载最先找到的资源
            if (typeof asset == 'string' && !UuidRegex.test(asset)) {
                asset = this._getRealExtUrl(asset);
            } else if (asset instanceof Array) {
                asset = asset.map(function (e) { return UuidRegex.test(e) ? e : _this._getRealExtUrl(e); });
            }
            cc.loader.release(asset);//释放原始资源
        }
    }
}

/**
 * 释放指定的资源，其使用方式与Cocos Creator API一致
 * 
 * @param {cc.Asset} asset 资源类型
 */
bProto.releaseAsset = function (asset) {//只能卸载资源本身，不能卸载被资源依赖的资源，例如卸载cc.SpriteFrame不会卸载cc.Texture2D
    this.releaseAsset(asset);
}

/**
 * 释放指定的资源，其使用方式与Cocos Creator API一致
 * 
 * @param {string} url 资源地址
 * @param {cc.Asset} type 资源类型，只有指定的类型的资源会被释放
 */
bProto.releaseRes = function (url, type) {
    if (this._type == cc.loader.downloader.SUBPACKAGE_TYPE.LOGIC_SUBPACKAGE) {
        cc.loader.releaseRes(this._getRealUrl(url), type);
    } else if (this._type == cc.loader.downloader.SUBPACKAGE_TYPE.DATA_SUBPACKAGE) {
        var fUrl = this._getRealExtUrl(url, type);
        var passet = this._getAsset(type, fUrl);
        this.release(passet || fUrl);//有包装资源优先释放包装资源，否则释放原始资源
    }
}

/**
 * 释放指定的资源文件夹中的所有资源，其使用方式与Cocos Creator API一致
 * 
 * @param {string} url 资源地址
 * @param {cc.Asset} type 资源类型，只有指定的类型的资源会被释放
 */
bProto.releaseResDir = function (url, type) {
    if (this._type == cc.loader.downloader.SUBPACKAGE_TYPE.LOGIC_SUBPACKAGE) {
        cc.loader.releaseResDir(this._getRealUrl(url), type);
    } else if (this._type == cc.loader.downloader.SUBPACKAGE_TYPE.DATA_SUBPACKAGE) {
        var rUrl = this._getRealUrl(url);
        var _this = this;
        var nurls = jsb.fileUtils.listFiles(rUrl);
        nurls = nurls.filter(function (e) { return e.substring(e.length - 2) != './' });
        //过滤类型
        if (type) {
            var sext = this._getExtSuggest(type);
            nurls = nurls.filter(function (e) { return _this._isExts(e, sext) }, _this);
        }
        for (var i = 0, fUrl; i < nurls.length; i++) {
            fUrl = nurls[i];
            var passet = this._getAsset(type, fUrl);
            this.release(passet || fUrl);//有包装资源优先释放包装资源，否则释放原始资源
        }
    }
}

/**
 * 释放所有资源，其使用方式与Cocos Creator API一致
 * 调用将彻底释放子包使用期间加载的资源
 */
bProto.releaseAll = function () {
    if (this._type == cc.loader.downloader.SUBPACKAGE_TYPE.LOGIC_SUBPACKAGE) {
        cc.loader.release(this._uuids);
    } else if (this._type == cc.loader.downloader.SUBPACKAGE_TYPE.DATA_SUBPACKAGE) {
        this._clearAllAsset();//释放包装类型资源
        var urls = this._getAllCacheUrls();
        cc.loader.release(urls);//进一步释放原始资源
    }
}

/**
 * 释放所有资源，其使用方式与Cocos Creator API一致
 * 
 * @param {cc.Asset|RawAsset|String|Array} asset 资源实例，url，uuid
 * @returns {Array} 返回指定资源依赖的资源列表
 */
bProto.getDependsRecursively = function (owner) {
    if (this._type == cc.loader.downloader.SUBPACKAGE_TYPE.LOGIC_SUBPACKAGE) {
        if (typeof owner == 'string') {
            owner = this._getRealUrl(owner);
        }
        return cc.loader.getDependsRecursively(owner);
    } else if (this._type == cc.loader.downloader.SUBPACKAGE_TYPE.DATA_SUBPACKAGE) {
        return [];//数据子包中的资源没有依赖关系
    }
}

proto.Bundle = Bundle;
