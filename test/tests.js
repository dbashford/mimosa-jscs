var path = require('path');
var assert = require('assert');
var expect = require('expect');
var Promise = require('bluebird');
var MimosaProject = require('./MimosaProject');

describe('node-jscs', function () {
  var project;

  beforeEach(function () {
    function setup() {
      project = new MimosaProject();
      project.mimosaConfig.modules.push('jscs');
      return project.exec('npm', 'install', path.normalize(process.cwd()));
    }

    // Setup sometimes fails because npm install fails. This appears
    // to be random and possibly a bug in npm. The code below is a
    // workaround that retries the installation twice before giving
    // up.
    return setup().catch(setup).catch(setup);
  });

  // Helper function that, given a MimosaProject build result, returns
  // a resolved promise with an array of JSCS violations. Intended for
  // chaining after MimosaProject.build to get easy access to
  // violations.
  function extractJscsViolations(buildResult) {
    var violations = [];
    buildResult.warnings.forEach(function (warning) {
      warning.message.indexOf('JSCS Error:') === 0 &&
        violations.push(warning.message);
    });
    return Promise.resolve(violations, buildResult);
  }

  // Helper function that builds and invokes a test function with
  // violations, testResult as arguments
  function buildAndTest(testFunc) {
    return project.build()
      .then(extractJscsViolations)
      .then(testFunc);
  }

  describe('when linting a single copied JS asset', function () {
    it('default configuration produces no warnings ' +
       'for correct (but ugly) code',
       function () {
         project.files.assets.javascripts['main.js'] = 'x=1;"ugly code"';

         return buildAndTest(function (violations) {
           expect(violations).toEqual([]);
         });
       });

    it('default configuration produces warnings ' +
       'for malformed code',
       function () {
         project.files.assets.javascripts['main.js'] = 'malformed code';

         return buildAndTest(function (violations) {
           expect(violations).toNotEqual([]);
         });
       });

    it('a preset can be used to enable rules', function () {
      project.mimosaConfig.jscs = { rules: { preset: 'crockford' } };

      project.files.assets.javascripts['main.js'] = 'x=1;"ugly code"';

      return buildAndTest(function (violations) {
        expect(violations).toNotEqual([]);
      });
    });

    it('a rule can be individually enabled', function () {
      project.mimosaConfig.jscs = { rules: { requireLineFeedAtFileEnd: true } };

      project.files.assets.javascripts['main.js'] = 'x=1;"ugly code"';

      return buildAndTest(function (violations) {
        expect(violations.length).toBe(1);
      });
    });
  });

  describe('when linting a project with a JS file, a coffeescript file, ' +
           'a vendor JS file, and a vendor coffeescript file',
           function ()
  {
    // Data driven tests that check that the correct files are linted
    // depending on compiled, copied, vendor config properties

    beforeEach(function () {
      project.mimosaConfig.modules.push('coffeescript');
    });

    [
      { compiled: false, copied: false, vendor: false,
        expectedLintedFiles: [] },
      { compiled: false, copied: true, vendor: false,
        expectedLintedFiles: ['copied.js'] },
      { compiled: true, copied: false, vendor: false,
        expectedLintedFiles: ['compiled.coffee'] },
      { compiled: true, copied: true, vendor: false,
        expectedLintedFiles: ['copied.js', 'compiled.coffee'] },
      { compiled: false, copied: false, vendor: true,
        expectedLintedFiles: ['copied-vendor.js'] },
      { compiled: false, copied: true, vendor: true,
        expectedLintedFiles: ['copied.js', 'copied-vendor.js'] },
      { compiled: true, copied: false, vendor: true,
        expectedLintedFiles: ['compiled.coffee', 'copied-vendor.js'] },
      { compiled: true, copied: true, vendor: true,
        expectedLintedFiles: ['copied.js',
                              'compiled.coffee',
                              'copied-vendor.js'] },
    ].forEach(function (params) {
      var count = params.expectedLintedFiles.length;
      var description =
            count + (count === 1 ? ' file is' : ' files are') +
            ' linted when ' +
            'compiled = ' + params.compiled +
            ', copied = ' + params.copied +
            ', vendor = ' + params.vendor;
      it(description, function () {
        project.mimosaConfig.jscs = {
          compiled: params.compiled,
          copied: params.copied,
          vendor: params.vendor,
          rules: {
            disallowDanglingUnderscores: true
          }
        };

        // Set up some files, each of which will produce one warning if
        // linted
        project.files.assets.javascripts['copied.js'] =
          'var _foo; // copied javascript file';
        project.files.assets.javascripts['compiled.coffee'] =
          '`var _foo // compiled coffeescript file`';
        project.files.assets.javascripts.vendor['copied-vendor.js'] =
          'var _foo // copied vendor javascript file';
        project.files.assets.javascripts.vendor['compiled-vendor.coffee'] =
          '`var _foo // compiled vendor coffeescript file`';

        // Build and check warnings to see that the expected set of
        // files where linted
        return buildAndTest(function (violations) {
          params.expectedLintedFiles.forEach(function (file) {
            var linted;
            violations.forEach(function (violation) {
              linted || (linted = violation.indexOf(file) !== -1);
            });

            expect(linted).toBe(true, 'expected file "' + file +
                                '" to be linted and produce one violation');
          });

          expect(violations.length).toBe(params.expectedLintedFiles.length);
        });
      });
    });
  });
});
