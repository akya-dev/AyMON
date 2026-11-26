The repository the nodes pull from: http://<centre>:8090/repo/

    aymon-<ver>-<platform>.zip / .tar.gz   the operator's signed engine packages
    packages.idx                           aysvc_index.py www/repo --out www/repo/packages.idx
    index.txt                              WRITTEN BY THE CENTRE: packages.idx's lines + the
                                           job lines of the rollout's open rings
    *.job                                  copied here by the centre when their ring opens

Do not edit index.txt: the centre writes it again within 5 s.
