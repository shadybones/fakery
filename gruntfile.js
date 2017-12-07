module.exports = function(grunt) {

    grunt.initConfig({
        jsv: grunt.option('target') || "es5",
        pkg: grunt.file.readJSON('package.json'),
        uglify: {
            options: {
                banner: '/*! <%= pkg.name %> <%= jsv %> v<%= pkg.version %> */\n'
            },
            build: {
                src: 'src/Observer.<%= jsv %>.js',
                dest: 'dist/observable.min.js'
            }
        }
    });

    // Load the plugin that provides the "uglify" task.
    grunt.loadNpmTasks('grunt-contrib-uglify');

    // Default task(s).
    grunt.registerTask('default', ['uglify']);

};