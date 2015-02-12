var gulp = require('gulp');
var gutil = require('gulp-util');
var cmd = require('child_process');
var git = require('gulp-git');
var fs = require('fs-extra');
var rename = require('gulp-rename');
var json = require("gulp-json-editor");
var replace = require('gulp-replace');

var pwd = process.cwd();
var gitrepo = 'git@vaadin-components.intra.itmill.com:/opt/git/';
var target = pwd + '/target';
var version = '0.2.0';
var major = version.replace(/(\d+\.\d+\.).*$/, "$1");
var patch = ~~((new Date().getTime() / 1000 - 1420070400) / 60)
var tag =  major + patch;

function system(command, cb) {
  cmd.exec(command, function(err, stdout, stderr) {
    if (err) throw err;
    if (cb) cb(err);
  });
}

function compileGwt(cb) {
  gutil.log("Updating maven dependencies ...");
  system('mvn clean compile -q -am -pl vaadin-components-gwt', function(){
    gutil.log("Compiling GWT components ...");
    system('mvn clean package -q -am -pl vaadin-components-gwt', function(){
      gutil.log("GWT components compilation suceeded.")
      if (cb) cb();
    });
  });
}

function updatePolymerComponent(component, tag, tmpdir ) {
  var message = 'Releasing_version_' + tag;
  var gitcwd = tmpdir + '/' + component;
  var giturl = gitrepo + '/' + component + '.git';
  var componentDir = 'vaadin-components/' + component;
  fs.removeSync(gitcwd);
  git.clone(giturl, {
    args : gitcwd
  }, function(err) {
    if (err) throw err;

    process.chdir(pwd);
    fs.copySync(componentDir, gitcwd);

    gulp.src(gitcwd + '/bower.json')
    .pipe(json({version: tag, name: component}))
    .pipe(gulp.dest(gitcwd));

    process.chdir(gitcwd);
    git.status({
      args : '--porcelain'
    }, function(err, stdout) {
      if (/\w/.test(stdout.replace('M bower.json','').replace(/\s/,''))) {
        for (line in stdout.split())
        // FIXME: This is executed in parallel, I think git.commit
        // implementation is buggy, so using a hack with system.
        // gulp.src("*")
        // .pipe(git.commit(message))
        // .pipe(git.tag('v' + tag, message));
        system('git add . ; git commit -q -a -m ' + message, function() {
          git.tag(tag, message, function() {
            git.push('origin', 'master', {
              args : '--tags'
            }, function() {
              gutil.log(">>>> Released a new version of " + component + " (" + tag + ")");
            })
          })
        })
      } else {
        gutil.log(">>>> No new changes to commit for component " + component);
      }
    });
  });
}

function copyGwtModule(component, moduleName, version, cb) {
  warDir = "vaadin-components-gwt/target/vaadin-components-gwt-" + version + "/";
  modulePath = warDir + '/' + moduleName + '/';
  webDir = 'vaadin-components-gwt/src/main/webapp/';
  var componentDir = 'vaadin-components/' + component;

  process.chdir(pwd);
  fs.mkdirsSync(componentDir);

  gulp.src(modulePath + moduleName +  '-import.html')
  .pipe(rename(function (path) {
    path.basename = component;
  }))
  .pipe(gulp.dest(componentDir));

  gulp.src(modulePath + 'deferred')
  .pipe(gulp.dest(componentDir));

  gulp.src(webDir + 'demo-' + component + '.html')
  .pipe(replace(/^.*(nocache|<link).*$/mg, ''))
  .pipe(replace(/<\/head/mg, '\n<link rel="import" href="' + component + '.html"></link>\n\n</head'))
  .pipe(replace(/src="bower_components\//mg, 'src="../'))
  .pipe(rename(function (path) {
    path.basename = 'demo';
  }))
  .pipe(gulp.dest(componentDir));

  gulp.src(webDir + 'bower.json')
  .pipe(gulp.dest(componentDir));

  if (cb) cb();
}

gulp.task('default', function() {
  console.log("\n  Use:\n    gulp <clean|gwt|deploy|all>\n");
});

gulp.task('clean', function() {
  fs.removeSync(target);
  fs.mkdirsSync(target);
})

gulp.task('gwt', function() {
  compileGwt(function() {
    copyGwtModule('vaadin-grid', 'VaadinGrid', version);
  });
})

gulp.task('deploy', function() {
  updatePolymerComponent('vaadin-button', tag, target);
  updatePolymerComponent('vaadin-grid', tag, target);
});

gulp.task('all', ['clean'], function() {
  compileGwt(function() {
    copyGwtModule('vaadin-grid', 'VaadinGrid', version, function() {
      gulp.start('deploy')
    });
  });
});

